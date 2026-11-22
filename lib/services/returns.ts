import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Database } from "@/db";
import {
  cashRegisterSessions,
  refunds,
  salesOrderItems,
  salesOrders,
  salesPayments,
  salesReturnItems,
  salesReturns,
} from "@/db/schema";
import type { ApiContext } from "@/lib/api";
import { invalidateSalesDashboard } from "@/lib/redis";
import { assertBranchAccess, assertPeriodOpen, AppError, writeAuditLog } from "@/lib/server";
import { postStockMovement, type DbTransaction } from "./stock-ledger";
import { postReturnToLedger } from "./ledger";
import { allocateRefundableLineTotals, allocateRefundPayments, incrementalLineRefund } from "./refund-allocation";
import { getActiveCashSession, lockCashSession } from "./cash-sessions";

const positive = z.union([z.string().regex(/^\d+$/), z.number().int().positive().safe()]).transform(BigInt).refine((value) => value > 0n);

export const salesReturnSchema = z.object({
  orderId: z.string().uuid(),
  reason: z.string().min(3).max(1_000),
  paymentId: z.string().uuid().optional(),
  externalReference: z.string().max(200).optional(),
  items: z.array(z.object({ orderItemId: z.string().uuid(), quantity: positive, restock: z.boolean().default(true) })).min(1).max(500),
}).superRefine((input, ctx) => {
  const ids = input.items.map((item) => item.orderItemId);
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  if (duplicates.length) {
    ctx.addIssue({ code: "custom", path: ["items"], message: `Duplicate orderItemId in return payload: ${duplicates.join(", ")}` });
  }
});

export const confirmRefundSchema = z.object({
  refundId: z.string().uuid(),
  externalReference: z.string().trim().min(1).max(200),
});

async function lockReturn(tx: DbTransaction, orderId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`sales-return:${orderId}`}))`);
}

async function updateRefundedOrder(
  tx: DbTransaction,
  order: { id: string; totalAmount: bigint },
  costAdjustment: bigint,
) {
  const [row] = await tx.select({ total: sql<string>`coalesce(sum(${refunds.amount}), 0)` })
    .from(refunds)
    .innerJoin(salesReturns, eq(salesReturns.id, refunds.returnId))
    .where(and(eq(salesReturns.orderId, order.id), eq(refunds.status, "processed")));
  const refundedAmount = BigInt(row.total);
  await tx.update(salesOrders).set({
    ...(refundedAmount > 0n ? { status: refundedAmount >= order.totalAmount ? "refunded" as const : "partially_refunded" as const } : {}),
    costAmount: sql`${salesOrders.costAmount} - ${costAdjustment}`,
    updatedAt: new Date(),
  }).where(eq(salesOrders.id, order.id));
}

export async function processSalesReturn(input: z.infer<typeof salesReturnSchema>, context: ApiContext) {
  const { cashierUserId, ...result } = await db.transaction(async (tx) => {
    await lockReturn(tx, input.orderId);
    const [order] = await tx.select().from(salesOrders).where(and(eq(salesOrders.id, input.orderId), eq(salesOrders.organizationId, context.organizationId))).limit(1);
    if (!order) throw new AppError("NOT_FOUND", "Sales order not found");
    assertBranchAccess(context.tenant, order.branchId);
    await assertPeriodOpen(tx, { organizationId: context.organizationId, branchId: order.branchId });
    if (!["paid", "partially_refunded"].includes(order.status)) throw new AppError("CONFLICT", "Order is not refundable");

    const eligiblePayments = await tx.select({
      id: salesPayments.id, method: salesPayments.method, amount: salesPayments.amount, provider: salesPayments.provider,
    }).from(salesPayments).where(and(
      eq(salesPayments.organizationId, context.organizationId),
      eq(salesPayments.orderId, order.id),
      eq(salesPayments.status, "settled"),
    )).orderBy(asc(salesPayments.createdAt), asc(salesPayments.id));
    const paymentById = new Map(eligiblePayments.map((payment) => [payment.id, payment]));
    if (input.paymentId && !paymentById.has(input.paymentId)) {
      throw new AppError("NOT_FOUND", "Settled payment for this order was not found");
    }

    const allOrderItems = await tx.select().from(salesOrderItems).where(eq(salesOrderItems.orderId, order.id));
    const byId = new Map(allOrderItems.map((item) => [item.id, item]));
    if (input.items.some((item) => !byId.has(item.orderItemId))) throw new AppError("NOT_FOUND", "One or more sales items were not found");
    const refundableByItem = allocateRefundableLineTotals(
      allOrderItems.map((item) => ({ id: item.id, amount: item.totalAmount, quantity: item.quantity })),
      order.totalAmount,
    );

    const previousReturns = await tx
      .select({ orderItemId: salesReturnItems.orderItemId, quantity: sql<string>`coalesce(sum(${salesReturnItems.quantity}), 0)` })
      .from(salesReturnItems)
      .innerJoin(salesReturns, eq(salesReturns.id, salesReturnItems.returnId))
      .where(and(inArray(salesReturnItems.orderItemId, input.items.map((item) => item.orderItemId)), inArray(salesReturns.status, ["approved", "refunded"])))
      .groupBy(salesReturnItems.orderItemId);
    const returnedByItem = new Map(previousReturns.map((item) => [item.orderItemId, BigInt(item.quantity)]));

    let totalAmount = 0n;
    const calculated = input.items.map((inputItem) => {
      const orderItem = byId.get(inputItem.orderItemId)!;
      const remaining = orderItem.quantity - (returnedByItem.get(orderItem.id) ?? 0n);
      if (inputItem.quantity > remaining) throw new AppError("VALIDATION_ERROR", "Return quantity exceeds remaining refundable quantity");
      const refundAmount = incrementalLineRefund(
        refundableByItem.get(orderItem.id) ?? 0n,
        orderItem.quantity,
        returnedByItem.get(orderItem.id) ?? 0n,
        inputItem.quantity,
      );
      totalAmount += refundAmount;
      return { inputItem, orderItem, refundAmount };
    });

    const previousRefunds = await tx
      .select({ paymentId: refunds.paymentId, amount: sql<string>`sum(${refunds.amount})` })
      .from(refunds)
      .innerJoin(salesReturns, eq(salesReturns.id, refunds.returnId))
      .where(and(eq(salesReturns.orderId, order.id), inArray(refunds.status, ["pending", "processed"])))
      .groupBy(refunds.paymentId);
    const usedByPayment = new Map(previousRefunds.map((refund) => [refund.paymentId, BigInt(refund.amount)]));
    const { allocations, remaining } = allocateRefundPayments(
      eligiblePayments.map((payment) => ({ ...payment, used: usedByPayment.get(payment.id) ?? 0n })),
      totalAmount,
      order.changeAmount,
      input.paymentId,
    );
    if (remaining > 0n) throw new AppError("VALIDATION_ERROR", "Refund melebihi sisa pembayaran transaksi");

    const parts = allocations.map((allocation) => ({ ...allocation, payment: paymentById.get(allocation.id)! }));
    const pending = parts.some(({ payment }) => Boolean(payment.provider));
    const hasCashRefund = parts.some(({ payment }) => payment.method === "cash" && !payment.provider);
    const shift = parts.some(({ payment }) => !payment.provider)
      ? await getActiveCashSession({ ...context, branchId: order.branchId }, tx)
      : null;
    if (shift) {
      await lockCashSession(tx, shift.id);
      const [active] = await tx.select({ id: cashRegisterSessions.id }).from(cashRegisterSessions)
        .where(and(eq(cashRegisterSessions.id, shift.id), eq(cashRegisterSessions.status, "open")));
      if (!active) throw new AppError("CONFLICT", "Shift kasir baru saja ditutup. Buka shift sebelum memproses refund.");
    } else if (hasCashRefund) {
      throw new AppError("CONFLICT", "Buka shift kasir untuk mencatat pengembalian tunai");
    }

    const returnId = crypto.randomUUID();
    const returnNumber = `RET-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${returnId.slice(0, 8).toUpperCase()}`;
    const [salesReturn] = await tx.insert(salesReturns).values({
      id: returnId,
      organizationId: context.organizationId,
      branchId: order.branchId,
      orderId: order.id,
      returnNumber,
      status: pending ? "approved" : "refunded",
      reason: input.reason,
      totalAmount,
      createdBy: context.session.user.id,
      approvedBy: context.session.user.id,
    }).returning();

    const stockRows = await tx.execute<{ variant_id: string; remaining: string }>(sql`
      select sm.variant_id, (-sum(sm.quantity))::text as remaining
      from stock_movements sm
      where sm.organization_id = ${context.organizationId}
        and sm.warehouse_id = ${order.warehouseId}
        and (
          (sm.type = 'sale' and sm.reference_type = 'sales_order' and sm.reference_id = ${order.id})
          or (sm.type = 'return' and sm.reference_type = 'sales_return'
            and sm.reference_id in (select id from sales_returns where order_id = ${order.id}))
        )
      group by sm.variant_id
    `);
    const stockByVariant = new Map(stockRows.rows.map((row) => [row.variant_id, BigInt(row.remaining)]));
    const returnItems = [];
    for (const { inputItem, orderItem, refundAmount } of calculated) {
      const variantId = orderItem.variantId;
      const available = variantId ? stockByVariant.get(variantId) ?? 0n : 0n;
      const restockQuantity = inputItem.quantity < available ? inputItem.quantity : available;
      const restock = inputItem.restock && restockQuantity > 0n;
      returnItems.push({
        organizationId: context.organizationId, returnId, orderItemId: orderItem.id,
        quantity: inputItem.quantity, refundAmount, restock,
      });
      if (!restock || !variantId) continue;
      stockByVariant.set(variantId, available - restockQuantity);
      await postStockMovement(tx, {
        organizationId: context.organizationId,
        branchId: order.branchId,
        warehouseId: order.warehouseId,
        variantId,
        quantity: restockQuantity,
        type: "return",
        referenceType: "sales_return",
        referenceId: returnId,
        unitCostAmount: orderItem.unitCostAmount,
        actorUserId: context.session.user.id,
      });
    }
    const items = await tx.insert(salesReturnItems).values(returnItems).returning();

    const refundRows = parts.length ? await tx.insert(refunds).values(parts.map(({ payment, amount }) => ({
      organizationId: context.organizationId,
      returnId,
      paymentId: payment.id,
      cashSessionId: payment.provider ? null : shift?.id,
      amount,
      status: payment.provider ? "pending" as const : "processed" as const,
      externalReference: payment.provider ? undefined : input.externalReference,
      processedAt: payment.provider ? null : new Date(),
    }))).returning() : [];

    for (const refund of refundRows) {
      if (refund.status !== "processed") continue;
      await postReturnToLedger(tx as unknown as Database, {
        organizationId: context.organizationId,
        branchId: order.branchId,
        returnId,
        returnNumber,
        refundId: refund.id,
        refundAmount: refund.amount,
        paymentMethod: paymentById.get(refund.paymentId!)!.method,
        actorUserId: context.session.user.id,
      });
    }

    const costAdjustment = pending ? 0n : calculated.reduce((sum, { inputItem, orderItem }) =>
      sum + (orderItem.unitCostAmount ?? 0n) * inputItem.quantity, 0n);
    await updateRefundedOrder(tx, order, costAdjustment);

    return {
      cashierUserId: order.cashierUserId,
      return: salesReturn,
      items,
      refund: refundRows.length === 1 ? refundRows[0] : null,
      refunds: refundRows.map((refund) => ({ ...refund, method: paymentById.get(refund.paymentId!)!.method })),
    };
  });
  await invalidateSalesDashboard(context.organizationId, result.return.branchId, cashierUserId, context.session.user.id);
  return result;
}

export async function confirmExternalRefund(input: z.infer<typeof confirmRefundSchema>, context: ApiContext) {
  const { refund, branchId, cashierUserId } = await db.transaction(async (tx) => {
    const [target] = await tx.select({
      orderId: salesOrders.id, totalAmount: salesOrders.totalAmount, branchId: salesReturns.branchId,
      returnId: salesReturns.id, returnNumber: salesReturns.returnNumber,
      cashierUserId: salesOrders.cashierUserId,
      provider: salesPayments.provider, method: salesPayments.method,
    }).from(refunds)
      .innerJoin(salesReturns, eq(salesReturns.id, refunds.returnId))
      .innerJoin(salesOrders, eq(salesOrders.id, salesReturns.orderId))
      .innerJoin(salesPayments, eq(salesPayments.id, refunds.paymentId))
      .where(and(eq(refunds.id, input.refundId), eq(refunds.organizationId, context.organizationId)));
    if (!target?.provider) throw new AppError("NOT_FOUND", "Refund provider tidak ditemukan");
    assertBranchAccess(context.tenant, target.branchId);
    await lockReturn(tx, target.orderId);
    const [current] = await tx.select().from(refunds).where(eq(refunds.id, input.refundId));
    if (current.status === "processed" && current.externalReference === input.externalReference) {
      return { refund: current, branchId: target.branchId, cashierUserId: target.cashierUserId };
    }
    if (current.status !== "pending") throw new AppError("CONFLICT", "Refund tidak lagi menunggu konfirmasi");
    await assertPeriodOpen(tx, { organizationId: context.organizationId, branchId: target.branchId });

    const referenceKey = `refund-reference:${context.organizationId}:${target.provider}:${input.externalReference}`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${referenceKey}))`);
    const [duplicate] = await tx.select({ id: refunds.id }).from(refunds)
      .innerJoin(salesPayments, eq(salesPayments.id, refunds.paymentId))
      .where(and(
        eq(refunds.organizationId, context.organizationId),
        eq(refunds.externalReference, input.externalReference),
        eq(refunds.status, "processed"),
        eq(salesPayments.provider, target.provider),
      )).limit(1);
    if (duplicate) throw new AppError("CONFLICT", "Referensi provider sudah digunakan untuk refund lain");

    const [confirmed] = await tx.update(refunds).set({
      status: "processed", externalReference: input.externalReference, processedAt: new Date(), updatedAt: new Date(),
    }).where(eq(refunds.id, input.refundId)).returning();
    await postReturnToLedger(tx as unknown as Database, {
      organizationId: context.organizationId,
      branchId: target.branchId,
      returnId: target.returnId,
      returnNumber: target.returnNumber,
      refundId: confirmed.id,
      refundAmount: confirmed.amount,
      paymentMethod: target.method,
      actorUserId: context.session.user.id,
    });
    const [outstanding] = await tx.select({ id: refunds.id }).from(refunds)
      .where(and(eq(refunds.returnId, target.returnId), ne(refunds.status, "processed"))).limit(1);
    let costAdjustment = 0n;
    if (!outstanding) {
      await tx.update(salesReturns).set({ status: "refunded", updatedAt: new Date() }).where(eq(salesReturns.id, target.returnId));
      const [cost] = await tx.select({
        amount: sql<string>`coalesce(sum(${salesReturnItems.quantity} * ${salesOrderItems.unitCostAmount}), 0)`,
      }).from(salesReturnItems).innerJoin(salesOrderItems, eq(salesOrderItems.id, salesReturnItems.orderItemId))
        .where(eq(salesReturnItems.returnId, target.returnId));
      costAdjustment = BigInt(cost.amount);
    }
    await updateRefundedOrder(tx, { id: target.orderId, totalAmount: target.totalAmount }, costAdjustment);
    await writeAuditLog({
      organizationId: context.organizationId, branchId: target.branchId, actorUserId: context.session.user.id,
      action: "refund.confirm_external", resourceType: "refund", resourceId: confirmed.id, requestId: context.requestId,
      after: { status: confirmed.status, externalReference: input.externalReference },
    }, tx as unknown as Database);
    return { refund: confirmed, branchId: target.branchId, cashierUserId: target.cashierUserId };
  });
  await invalidateSalesDashboard(context.organizationId, branchId, cashierUserId);
  return refund;
}
