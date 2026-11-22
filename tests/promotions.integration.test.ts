import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { eq } from "drizzle-orm";

test("concurrent checkouts respect promotion quota and voucher balance", {
  skip: process.env.PROMOTION_INTEGRATION !== "true",
}, async () => {
  const databaseUrl = new URL(process.env.DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(databaseUrl.hostname), "Use migrated local PostgreSQL");
  const { db, pool } = await import("@/db");
  const { branches, organizations, orderPromotions, promotions, salesOrders, vouchers, warehouses } = await import("@/db/schema");
  const { recordPromotions, resolvePromotionDiscount } = await import("@/lib/services/promotions");
  const organizationId = randomUUID();
  try {
    await db.insert(organizations).values({ id: organizationId, name: "Checkout test", slug: organizationId });
    const [branch] = await db.insert(branches).values({ organizationId, code: "TEST", name: "Test" }).returning();
    const [warehouse] = await db.insert(warehouses).values({ organizationId, branchId: branch.id, code: "TEST", name: "Test" }).returning();
    const [limited, shared] = await db.insert(promotions).values([
      { organizationId, name: "One use", code: "SINGLE", type: "fixed", valueAmount: 10n, usageLimit: 1 },
      { organizationId, name: "Two uses", code: "SHARED", type: "fixed", valueAmount: 10n, usageLimit: 2 },
    ]).returning();
    const [voucher] = await db.insert(vouchers).values({
      organizationId, code: "VOUCHER", initialAmount: 100n, remainingAmount: 100n,
    }).returning();

    const checkout = (records: Awaited<ReturnType<typeof resolvePromotionDiscount>>["records"]) =>
      db.transaction(async (tx) => {
        const [order] = await tx.insert(salesOrders).values({
          organizationId, branchId: branch.id, warehouseId: warehouse.id, orderNumber: randomUUID(),
        }).returning({ id: salesOrders.id });
        await recordPromotions(tx, { organizationId, orderId: order.id, records });
      });

    const limitedQuote = await resolvePromotionDiscount(db, { organizationId, taxableAmount: 80n, promotionCode: "SINGLE" });
    const voucherQuote = await resolvePromotionDiscount(db, {
      organizationId, taxableAmount: 80n, promotionCode: "SHARED", voucherCode: "VOUCHER",
    });
    for (const [records, error] of [[limitedQuote.records, /kuota/i], [voucherQuote.records, /saldo/i]] as const) {
      const attempts = await Promise.allSettled([checkout(records), checkout(records)]);
      assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
      const rejected = attempts.find((attempt) => attempt.status === "rejected");
      assert.match(String(rejected?.reason), error);
    }

    const [limitedAfter] = await db.select().from(promotions).where(eq(promotions.id, limited.id));
    const [sharedAfter] = await db.select().from(promotions).where(eq(promotions.id, shared.id));
    const [voucherAfter] = await db.select().from(vouchers).where(eq(vouchers.id, voucher.id));
    assert.equal(limitedAfter.usageCount, 1);
    assert.equal(sharedAfter.usageCount, 1);
    assert.equal(voucherAfter.remainingAmount, 30n);
    assert.equal((await db.select().from(salesOrders).where(eq(salesOrders.organizationId, organizationId))).length, 2);
    assert.equal((await db.select().from(orderPromotions).where(eq(orderPromotions.organizationId, organizationId))).length, 3);

    const finalQuote = await resolvePromotionDiscount(db, { organizationId, taxableAmount: 30n, voucherCode: "VOUCHER" });
    await checkout(finalQuote.records);
    const [redeemed] = await db.select().from(vouchers).where(eq(vouchers.id, voucher.id));
    assert.equal(redeemed.remainingAmount, 0n);
    assert.equal(redeemed.status, "redeemed");
  } finally {
    try {
      await db.delete(salesOrders).where(eq(salesOrders.organizationId, organizationId));
      await db.delete(organizations).where(eq(organizations.id, organizationId));
    } finally {
      await pool.end();
    }
  }
});
