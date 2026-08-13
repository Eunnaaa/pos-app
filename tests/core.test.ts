import assert from "node:assert/strict";
import test from "node:test";
import { AppError, normalizeError } from "@/lib/server/errors";
import { MAX_SYNC_ATTEMPTS, classifySyncResponse } from "@/lib/offline/queue";
import { addMoney, allocateMoney, money, parseMoney, subtractMoney } from "@/lib/server/money";
import { hashIdempotentRequest } from "@/lib/server/idempotency-hash";
import { decodeCursor, encodeCursor, paginated } from "@/lib/server/pagination";
import { calculateSettlement } from "@/lib/services/cash-settlement";
import { addClosingTotals } from "@/lib/services/closing-totals";
import { parseRateToBps, exclusiveTax, inclusiveTax } from "@/lib/server/tax";
import { can, requirePermission } from "@/lib/server/rbac";
import { assertSafeWebhookUrl, signWebhook, verifyWebhookSignature } from "@/lib/server/webhook";
import { toJsonValue } from "@/lib/api/response";

void test("money arithmetic remains exact in rupiah minor units", () => {
  assert.deepEqual(parseMoney("125000"), { amount: 125000n, currency: "IDR" });
  assert.deepEqual(parseMoney("12.50", "USD", 2), { amount: 1250n, currency: "USD" });
  assert.equal(addMoney(money(10n), money(5n)).amount, 15n);
  assert.equal(subtractMoney(money(10n), money(5n)).amount, 5n);
  assert.deepEqual(allocateMoney(money(100n), [1n, 1n, 1n]).map((item) => item.amount), [33n, 33n, 34n]);
});

void test("money validation rejects invalid precision and currency mismatch", () => {
  assert.throws(() => parseMoney("1.005", "USD", 2), AppError);
  assert.throws(() => addMoney(money(1n, "IDR"), money(1n, "USD")), AppError);
});

void test("RBAC applies default least-privilege matrix", () => {
  assert.equal(can("owner", "settings:manage"), true);
  assert.equal(can("cashier", "pos:write"), true);
  assert.equal(can("cashier", "finance:write"), false);
  assert.equal(can("cashier", "inventory:write"), false);
  assert.equal(can("cashier", "reports:read"), true);
  assert.throws(() => requirePermission("cashier", "users:manage"), AppError);
  assert.doesNotThrow(() => requirePermission("cashier", "finance:write", ["finance:write"]));
});

void test("owner and cashier permissions match final role policy", () => {
  assert.equal(can("owner", "users:manage"), true);
  assert.equal(can("owner", "finance:write"), true);
  for (const permission of ["dashboard:read", "pos:write", "sales:read", "sales:write", "customers:read", "customers:write"] as const) {
    assert.equal(can("cashier", permission), true);
  }
  for (const permission of ["inventory:write", "purchases:write", "finance:read", "settings:manage", "users:manage"] as const) {
    assert.equal(can("cashier", permission), false);
  }
  assert.equal(can("cashier", "reports:read"), true);
  assert.equal(can("cashier", "inventory:read"), true);
});

void test("role policy rejects removed roles at type boundary", () => {
  assert.throws(() => requirePermission("cashier", "users:manage"), AppError);
});

void test("cash settlement calculates tender expected values and variance", () => {
  const settlement = calculateSettlement({
    openingAmount: 100_000n,
    payments: { cash: 500_000n, qris: 200_000n },
    refunds: { cash: 50_000n, qris: 10_000n },
    cashChange: 25_000n,
    cashIn: 20_000n,
    cashOut: 10_000n,
    actuals: { cash: 530_000n, qris: 190_000n, debit: 5_000n },
  });
  assert.equal(settlement.expectedCash, 535_000n);
  assert.equal(settlement.actualCash, 530_000n);
  assert.equal(settlement.cashVariance, -5_000n);
  assert.deepEqual(settlement.breakdown.qris, { expected: 190_000n, actual: 190_000n, variance: 0n });
  assert.deepEqual(settlement.breakdown.debit, { expected: 0n, actual: 5_000n, variance: 5_000n });
});

void test("closing totals roll up children without losing precision", () => {
  const day = { salesGross: "500000", salesNet: "450000", discounts: "50000", tax: "0", cost: "300000", profit: "150000", refunds: "0", expenses: "20000", cashIn: "0", cashOut: "10000", orders: 3, paymentMethods: { cash: "300000", qris: "150000" } };
  const other = { ...day, orders: 2, paymentMethods: { cash: "100000", debit: "50000" } };
  const total = addClosingTotals(day, other);
  assert.equal(total.salesNet, "900000");
  assert.equal(total.profit, "300000");
  assert.equal(total.orders, 5);
  assert.deepEqual(total.paymentMethods, { cash: "400000", qris: "150000", debit: "50000" });
});

void test("webhook HMAC verifies valid payload and rejects tampering", () => {
  const timestamp = Math.floor(Date.now() / 1_000);
  const secret = "a-secure-webhook-secret-with-32-characters";
  const payload = JSON.stringify({ event: "sale.paid", id: "evt_123" });
  const signature = signWebhook(payload, timestamp, secret);
  assert.doesNotThrow(() => verifyWebhookSignature(payload, `sha256=${signature}`, timestamp, secret));
  assert.throws(() => verifyWebhookSignature(`${payload}x`, signature, timestamp, secret), AppError);
  assert.throws(() => verifyWebhookSignature(payload, signature, timestamp - 1_000, secret), AppError);
});

void test("webhook targets reject local and private network URLs", async () => {
  const valid = await assertSafeWebhookUrl("https://example.com/hooks/sale");
  assert.equal(valid.hostname, "example.com");
  for (const url of ["http://example.com", "https://localhost/hook", "https://127.0.0.1/hook", "https://10.0.0.8/hook", "https://user:pass@example.com/hook"]) {
    await assert.rejects(() => assertSafeWebhookUrl(url), AppError);
  }
});

void test("pagination cursors round-trip and reject malformed input", () => {
  const cursor = encodeCursor({ id: "row-2", sort: "2026-07-28" });
  assert.deepEqual(decodeCursor(cursor), { id: "row-2", sort: "2026-07-28" });
  assert.throws(() => decodeCursor("not-a-cursor"), AppError);
  const result = paginated([1, 2, 3], 2, (item) => ({ id: String(item), sort: item }));
  assert.deepEqual(result.data, [1, 2]);
  assert.equal(result.page.hasMore, true);
  assert.ok(result.page.nextCursor);
});

void test("idempotency hashing supports bigint and stable object order", () => {
  const left = hashIdempotentRequest({ quantity: 10n, amount: 25000n, nested: { b: 2, a: 1 } });
  const right = hashIdempotentRequest({ nested: { a: 1, b: 2 }, amount: 25000n, quantity: 10n });
  assert.equal(left, right);
  assert.notEqual(left, hashIdempotentRequest({ quantity: 11n, amount: 25000n }));
});

void test("offline sync verdict dead-letters rejects without stranding the queue", () => {
  assert.equal(classifySyncResponse(201, 0), "synced");
  assert.equal(classifySyncResponse(200, 4), "synced");
  // Permanent: replaying these can never succeed, so drop out of the queue immediately.
  for (const status of [400, 403, 404, 422]) assert.equal(classifySyncResponse(status, 0), "failed");
  // 409 is ambiguous (already exists vs still processing); retry rather than discard a transaction.
  assert.equal(classifySyncResponse(409, 0), "retry");
  assert.equal(classifySyncResponse(401, 0), "retry");
  assert.equal(classifySyncResponse(429, 0), "retry");
  assert.equal(classifySyncResponse(500, 0), "retry");
  assert.equal(classifySyncResponse(0, 0), "retry");
  // ...but not forever: the attempt cap stops an infinite retry loop.
  assert.equal(classifySyncResponse(500, MAX_SYNC_ATTEMPTS - 1), "failed");
  assert.equal(classifySyncResponse(0, MAX_SYNC_ATTEMPTS - 1), "failed");
});

void test("unique violations normalize to conflict instead of a retryable server error", () => {
  assert.equal(normalizeError(Object.assign(new Error("duplicate key"), { code: "23505" })).status, 409);
  // The driver wraps the pg error, so the cause chain has to be walked.
  assert.equal(normalizeError(new Error("insert failed", { cause: { code: "23505" } })).code, "CONFLICT");
  assert.equal(normalizeError(new Error("boom")).code, "INTERNAL_ERROR");
  assert.equal(normalizeError(Object.assign(new Error("bad input"), { code: "22P02" })).code, "INTERNAL_ERROR");
});

void test("API JSON serialization preserves bigint and dates", () => {
  assert.deepEqual(toJsonValue({ amount: 10000n, createdAt: new Date("2026-07-28T00:00:00.000Z") }), {
    amount: "10000",
    createdAt: "2026-07-28T00:00:00.000Z",
  });
});

void test("tax rate parsing converts percentage strings to basis points", () => {
  assert.equal(parseRateToBps("11.0000"), 1100n); // 11% PPN
  assert.equal(parseRateToBps("0"), 0n);
  assert.equal(parseRateToBps("0.5000"), 50n); // 0.5%
  assert.equal(parseRateToBps("100"), 10000n); // 100%
  assert.equal(parseRateToBps("invalid"), 0n);
  assert.equal(parseRateToBps("-5"), 0n);
});

void test("exclusive tax adds on top of the net amount", () => {
  // 11% exclusive on Rp 100.000 => Rp 11.000 tax, total Rp 111.000
  const net = 100000n;
  const rateBps = parseRateToBps("11.0000");
  const tax = exclusiveTax(net, rateBps);
  assert.equal(tax, 11000n);
  assert.equal(net + tax, 111000n);
});

void test("inclusive tax is embedded in the gross amount", () => {
  // 11% inclusive on Rp 111.000 gross => Rp 11.000 tax, net Rp 100.000
  const gross = 111000n;
  const rateBps = parseRateToBps("11.0000");
  const tax = inclusiveTax(gross, rateBps);
  assert.equal(tax, 11000n);
  assert.equal(gross - tax, 100000n);
});
