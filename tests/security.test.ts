import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { API_RATE_LIMITS, resolveRateLimitPolicy } from "@/lib/rate-limit-policy";
import { assertBranchAccess } from "@/lib/server/branch-access";
import { resolveAuthOrigin } from "@/lib/server/auth-origin";
import { AppError } from "@/lib/server/errors";
import { validateImageBytes } from "@/lib/server/image-validation";
import { decryptSecret, encryptSecret, safeEqualSecret } from "@/lib/server/secrets";
import { parseJson } from "@/lib/server/validation";
import { getSuperAdminEmails, isSuperAdminUser } from "@/lib/super-admin";

void test("API rate-limit policies match the production contract", () => {
  assert.deepEqual(API_RATE_LIMITS.internal, { read: 120, write: 40 });
  assert.deepEqual(API_RATE_LIMITS.selfOrder, { read: 300, write: 60 });
  assert.equal(resolveRateLimitPolicy("/api/v1/products", "GET").limit, 120);
  assert.equal(resolveRateLimitPolicy("/api/v1/products", "POST").limit, 40);
  assert.equal(resolveRateLimitPolicy("/api/v1/self-order/menu", "GET").limit, 300);
  assert.equal(resolveRateLimitPolicy("/api/v1/self-order/orders", "POST").limit, 60);
});

void test("auth origin cannot be overridden through untrusted proxy headers", () => {
  const malicious = new Request("https://internal.example/api/auth/sign-in", {
    headers: {
      origin: "https://evil.example",
      "x-forwarded-host": "evil.example",
      "x-forwarded-proto": "https",
    },
  });
  assert.equal(resolveAuthOrigin(malicious, {
    baseUrl: "https://pos.example.com",
    trustedOrigins: ["https://pos.example.com", "https://preview.example.com"],
    trustProxy: true,
    isProduction: true,
  }), "https://pos.example.com");

  const preview = new Request("http://internal/api/auth/sign-in", {
    headers: {
      "x-forwarded-host": "preview.example.com",
      "x-forwarded-proto": "https",
    },
  });
  assert.equal(resolveAuthOrigin(preview, {
    baseUrl: "http://localhost:3000",
    trustedOrigins: ["https://preview.example.com"],
    trustProxy: true,
    isProduction: false,
  }), "https://preview.example.com");
});

void test("restricted members cannot access an unassigned or omitted branch", () => {
  const restricted = { role: "cashier", branchIds: ["branch-a"] };
  assert.doesNotThrow(() => assertBranchAccess(restricted, "branch-a"));
  assert.throws(() => assertBranchAccess(restricted, "branch-b"), AppError);
  assert.throws(() => assertBranchAccess(restricted), AppError);
  assert.doesNotThrow(() => assertBranchAccess({ role: "owner", branchIds: ["branch-a"] }, "branch-b"));
  assert.doesNotThrow(() => assertBranchAccess({ role: "cashier", branchIds: [] }, "branch-b"));
});

void test("super admin requires a server allowlist, verified email, and 2FA", () => {
  const previous = process.env.SUPER_ADMIN_EMAILS;
  process.env.SUPER_ADMIN_EMAILS = "Admin@Example.com, second@example.com,admin@example.com";
  try {
    assert.deepEqual(getSuperAdminEmails(), ["admin@example.com", "second@example.com"]);
    assert.equal(isSuperAdminUser({ email: "admin@example.com", emailVerified: true, twoFactorEnabled: true }), true);
    assert.equal(isSuperAdminUser({ email: "admin@example.com", emailVerified: false, twoFactorEnabled: true }), false);
    assert.equal(isSuperAdminUser({ email: "admin@example.com", emailVerified: true, twoFactorEnabled: false }), false);
    assert.equal(isSuperAdminUser({ email: "unknown@example.com", emailVerified: true, twoFactorEnabled: true }), false);
  } finally {
    if (previous === undefined) delete process.env.SUPER_ADMIN_EMAILS;
    else process.env.SUPER_ADMIN_EMAILS = previous;
  }
});

void test("image validation checks magic bytes instead of trusting MIME only", () => {
  const pngHeader = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(validateImageBytes(pngHeader, "image/png", ["image/png"]).extension, "png");
  assert.throws(() => validateImageBytes(new TextEncoder().encode("<script>alert(1)</script>"), "image/png", ["image/png"]), AppError);
  assert.throws(() => validateImageBytes(pngHeader, "image/svg+xml", ["image/png"]), AppError);
});

void test("secret comparison handles matches without direct string equality", () => {
  assert.equal(safeEqualSecret("expected", "expected"), true);
  assert.equal(safeEqualSecret("unexpected", "expected"), false);
});

void test("payment credentials are encrypted and authenticated at rest", () => {
  (process.env as Record<string, string | undefined>).NODE_ENV = "test";
  process.env.DATABASE_URL ||= "postgresql://test:test@localhost:5432/test";
  process.env.BETTER_AUTH_SECRET ||= "test-auth-secret-with-more-than-32-characters";
  process.env.DATA_ENCRYPTION_KEY ||= "test-data-key-with-more-than-32-characters";
  const encrypted = encryptSecret("midtrans-server-secret");
  assert.match(encrypted, /^enc:v1:/);
  assert.notEqual(encrypted, "midtrans-server-secret");
  assert.equal(decryptSecret(encrypted), "midtrans-server-secret");
  const tamperedParts = encrypted.split(":");
  tamperedParts[3] = "AAAAAAAAAAAAAAAAAAAAAA";
  assert.throws(() => decryptSecret(tamperedParts.join(":")), AppError);
});

void test("JSON parser enforces content type and payload size", async () => {
  const schema = z.object({ value: z.string() });
  const request = new Request("https://example.com/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: "safe" }),
  });
  assert.deepEqual(await parseJson(request, schema, 64), { value: "safe" });

  const oversized = new Request("https://example.com/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: "x".repeat(100) }),
  });
  await assert.rejects(() => parseJson(oversized, schema, 64), AppError);
});
