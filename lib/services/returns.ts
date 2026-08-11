import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  refunds,
  salesOrderItems,
  salesOrders,
  salesPayments,
  salesReturnItems,
  salesReturns,
} from "@/db/schema";
import type { ApiContext } from "@/lib/api";
import { assertPeriodOpen, AppError } from "@/lib/server";
import { postStockMovement } from "./stock-ledger";
import { postReturnToLedger } from "./ledger";
import type { Database } from "@/db";

const positive = z.union([z.string().regex(/^\d+$/), z.number().int().positive().safe()]).transform(BigInt).refine((value) => value > 0n);

export const salesReturnSchema = z.object({
  orderId: z.string().uuid(),
  reason: z.string().min(3).max(1_000),
  paymentId: z.string().uuid().optional(),
  externalReference: z.string().max(200).optional(),
  items: z.array(z.object({ orderItemId: z.string().uuid(), quantity: positive, restock: z.boolean().default(true) })).min(1).max(500),
});

export async function processSalesReturn(input: z.infer<typeof salesReturnSchema>, context: ApiContext) {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(salesOrders).where(and(eq(salesOrders.id, input.orderId), eq(salesOrders.organizationId, context.organizationId))).limit(1);
    if (!order) throw new AppError("NOT_FOUND", "Sales order not found");
    await assertPeriodOpen(tx, { organizationId: context.organizationId, branchId: order.branchId });
    if (!["paid", "partially_refunded"].includes(order.status)) throw new AppError("CONFLICT", "Order is not refundable");

    const orderItems = await tx.select().from(salesOrderItems).where(and(eq(salesOrderItems.orderId, order.id), inArray(salesOrderItems.id, input.items.map((item) => item.orderItemId))));
    const byId = new Map(orderItems.map((item) => [item.id, item]));
    if (byId.size !== new Set(input.items.map((item) => item.orderItemId)).size) throw new AppError("NOT_FOUND", "One or more sales items were not found");

    const previousReturns = await tx
      .select({ orderItemId: salesReturnItems.orderItemId, quantity: sql<string>`coalesce(sum(${salesReturnItems.quantity}), 0)` })
      .from(salesReturnItems)
      .innerJoin(salesReturns, eq(salesReturns.id, salesReturnItems.returnId))
      .where(and(inArray(salesReturnItems.orderItemId, input.items.map((item) => item.orderItemId)), eq(salesReturns.status, "refunded")))
      .groupBy(salesReturnItems.orderItemId);
    const returnedByItem = new Map(previousReturns.map((item) => [item.orderItemId, BigInt(item.quantity)]));

    let totalAmount = 0n;
    const calculated = input.items.map((inputItem) => {
      const orderItem = byId.get(inputItem.orderItemId)!;
      const remaining = orderItem.quantity - (returnedByItem.get(orderItem.id) ?? 0n);
      if (inputItem.quantity > remaining) throw new AppError("VALIDATION_ERROR", "Return quantity exceeds remaining refundable quantity");
      const refundAmount = (orderItem.totalAmount * inputItem.quantity) / orderItem.quantity;
      totalAmount += refundAmount;
      return { inputItem, orderItem, refundAmount };
    });

    const returnId = crypto.randomUUID();
    const returnNumber = `RET-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${returnId.slice(0, 8).toUpperCase()}`;
    const [salesReturn] = await tx.insert(salesReturns).values({
      id: returnId,
      organizationId: context.organizationId,
      branchId: order.branchId,
      orderId: order.id,
      returnNumber,
      status: "refunded",
      reason: input.reason,
      totalAmount,
      createdBy: context.session.user.id,
      approvedBy: context.session.user.id,
    }).returning();

    const items = await tx.insert(salesReturnItems).values(calculated.map(({ inputItem, orderItem, refundAmount }) => ({
      organizationId: context.organizationId,
      returnId,
      orderItemId: orderItem.id,
      quantity: inputItem.quantity,
      refundAmount,
      restock: inputItem.restock,
    }))).returning();

    for (const { inputItem, orderItem } of calculated) {
      if (!inputItem.restock || !orderItem.variantId) continue;
      await postStockMovement(tx, {
        organizationId: context.organizationId,
        branchId: order.branchId,
        warehouseId: order.warehouseId,
        variantId: orderItem.variantId,
        quantity: inputItem.quantity,
        type: "return",
        referenceType: "sales_return",
        referenceId: returnId,
        unitCostAmount: orderItem.unitCostAmount,
        actorUserId: context.session.user.id,
      });
    }

    const [refund] = await tx.insert(refunds).values({
      organizationId: context.organizationId,
      returnId,
      paymentId: input.paymentId,
      amount: totalAmount,
      status: "processed",
      externalReference: input.externalReference,
      processedAt: new Date(),
    }).returning();

    const existingRefunds = await tx.select({ total: sql<string>`coalesce(sum(${refunds.amount}), 0)` }).from(refunds).innerJoin(salesReturns, eq(salesReturns.id, refunds.returnId)).where(and(eq(salesReturns.orderId, order.id), eq(refunds.status, "processed")));
    const refundedAmount = BigInt(existingRefunds[0]?.total ?? "0");
    // Adjust costAmount for returned items (COGS recovery)
    const costAdjustment = calculated.reduce((sum, { inputItem, orderItem }) => sum + (orderItem.unitCostAmount ?? 0n) * inputItem.quantity, 0n);
    await tx.update(salesOrders).set({ status: refundedAmount >= order.totalAmount ? "refunded" as const : "partially_refunded" as const, costAmount: sql`${salesOrders.costAmount} - ${costAdjustment}`, updatedAt: new Date() }).where(eq(salesOrders.id, order.id));

    // Post to financial ledger (reverse entry)
    let refundMethod = "cash";
    if (input.paymentId) {
      const [payment] = await tx.select({ method: salesPayments.method }).from(salesPayments).where(and(eq(salesPayments.id, input.paymentId), eq(salesPayments.organizationId, context.organizationId))).limit(1);
      if (payment) refundMethod = payment.method;
    }
    await postReturnToLedger(tx as unknown as Database, {
      organizationId: context.organizationId,
      branchId: order.branchId,
      returnId,
      returnNumber,
      refundAmount: totalAmount,
      paymentMethod: refundMethod,
      actorUserId: context.session.user.id,
    });

    return { return: salesReturn, items, refund };
  });
}
