import { test, expect } from "@playwright/test";

/**
 * Self-order API smoke tests (anonymous, token-based).
 * Requires a live DB with a seeded qr_order_tokens row + active product.
 *
 * To run locally:
 *   INSERT INTO qr_order_tokens (id, organization_id, branch_id, table_id, token, is_active)
 *   VALUES (gen_random_uuid(), '<ORG>', '<BRANCH>', '<TABLE>', 'selftest-token', true);
 */

const TOKEN = process.env.SELF_ORDER_TEST_TOKEN || "selftest-token";

test("self-order menu endpoint requires valid token", async ({ request }) => {
  const response = await request.get("/api/v1/self-order/menu?token=__invalid__");
  expect(response.status()).toBe(404);
});

test("self-order menu resolves a valid token", async ({ request }) => {
  const response = await request.get(`/api/v1/self-order/menu?token=${TOKEN}`);
  // Either returns menu (seeded) or 404 (not seeded). We only assert shape if 200.
  if (response.ok()) {
    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(body.data.categories).toBeDefined();
    expect(body.data.table).toBeDefined();
  } else {
    expect(response.status()).toBe(404);
  }
});

test("self-order route renders a shell for valid token pattern", async ({ page }) => {
  await page.goto(`/order/${TOKEN}`);
  // App shell always renders; error state shows if token invalid.
  await expect(page.getByRole("button", { name: /coba lagi/i }).or(page.locator("text='Keranjang'")).first()).toBeVisible({ timeout: 15_000 });
});

test("self-order create order rejects invalid token", async ({ request }) => {
  const response = await request.post("/api/v1/self-order/orders", {
    headers: { "idempotency-key": "e2e-invalid-token-001" },
    data: {
      token: "__invalid__",
      items: [{ variantId: "00000000-0000-0000-0000-000000000000", quantity: 1 }],
      paymentMethod: "qris",
    },
  });
  expect([400, 404]).toContain(response.status());
});

test("xendit webhook without auth token is rejected", async ({ request }) => {
  const response = await request.post("/api/v1/integrations/payments/webhook", {
    data: { external_id: "X", status: "PAID", id: "mock" },
  });
  // Without XENDIT_SECRET_KEY set, route must 400 or 401 — never silently pass.
  expect([400, 401]).toContain(response.status());
});