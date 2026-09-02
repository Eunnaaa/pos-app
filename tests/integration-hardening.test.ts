process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/postgres";
process.env.BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET || "012345678901234567890123456789012345";
process.env.BETTER_AUTH_URL = process.env.BETTER_AUTH_URL || "http://localhost:3000";
process.env.NEXT_PUBLIC_BETTER_AUTH_URL = process.env.NEXT_PUBLIC_BETTER_AUTH_URL || "http://localhost:3000";
process.env.TRUSTED_ORIGINS = process.env.TRUSTED_ORIGINS || "http://localhost:3000";

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  isOrderFullySettled,
  parseGatewayAmount,
  verifyMidtransNotificationSignature,
} from "@/lib/integrations/payments";
import { escapeEmailHtml, normalizeWhatsAppTarget } from "@/lib/integrations/notifications";
import { scrubSensitiveText, scrubTelemetryValue } from "@/lib/observability/scrub";
import { isSaleLedgerBalanced } from "@/lib/services/ledger";
import { AppError } from "@/lib/server/errors";

void test("Midtrans signature validation rejects altered notification data", () => {
  const input = { orderId: "POS-001", statusCode: "200", grossAmount: "1000.00", serverKey: "Mid-server-test" };
  const signature = createHash("sha512")
    .update(`${input.orderId}${input.statusCode}${input.grossAmount}${input.serverKey}`)
    .digest("hex");
  assert.equal(verifyMidtransNotificationSignature({ ...input, signature }), true);
  assert.equal(verifyMidtransNotificationSignature({ ...input, grossAmount: "2000.00", signature }), false);
});

void test("gateway amounts only accept whole non-negative rupiah", () => {
  assert.equal(parseGatewayAmount("1000.00"), 1000n);
  assert.equal(parseGatewayAmount(1000), 1000n);
  assert.equal(parseGatewayAmount("1000.50"), undefined);
  assert.equal(parseGatewayAmount(-1), undefined);
  assert.equal(parseGatewayAmount("1e3"), undefined);
});

void test("split payment only finalizes after every required amount settles", () => {
  assert.equal(isOrderFullySettled(1000n, [
    { amount: 500n, status: "settled" },
    { amount: 500n, status: "authorized" },
  ]), false);
  assert.equal(isOrderFullySettled(1000n, [
    { amount: 500n, status: "settled" },
    { amount: 500n, status: "settled" },
  ]), true);
});

void test("sale ledger enforces equal payment debits and income/change credits", () => {
  assert.equal(isSaleLedgerBalanced({ totalAmount: 1000n, changeAmount: 0n, payments: [{ amount: 500n }, { amount: 500n }] }), true);
  assert.equal(isSaleLedgerBalanced({ totalAmount: 1000n, changeAmount: 200n, payments: [{ amount: 1200n }] }), true);
  assert.equal(isSaleLedgerBalanced({ totalAmount: 1000n, changeAmount: 0n, payments: [{ amount: 900n }] }), false);
});

void test("notification inputs normalize phone numbers and escape HTML", () => {
  assert.equal(normalizeWhatsAppTarget("0812-3456-7890"), "6281234567890");
  assert.throws(() => normalizeWhatsAppTarget("123"), AppError);
  assert.equal(escapeEmailHtml(`<img src=x onerror="boom"> & 'x'`), "&lt;img src=x onerror=&quot;boom&quot;&gt; &amp; &#39;x&#39;");
});

void test("telemetry scrubbing redacts nested credentials and free-text secrets", () => {
  const scrubbed = scrubTelemetryValue({
    request: { headers: { authorization: "Bearer secret-value" } },
    midtrans_server_key: "Mid-server-secret",
    note: "token=abc123 card 4111 1111 1111 1111",
  }) as Record<string, unknown>;
  assert.deepEqual((scrubbed.request as { headers: { authorization: string } }).headers.authorization, "[redacted]");
  assert.equal(scrubbed.midtrans_server_key, "[redacted]");
  assert.equal(scrubbed.note, "token=[redacted] card [redacted-card]");
  assert.equal(scrubSensitiveText("Authorization Bearer abc.def"), "Authorization Bearer [redacted]");
});
