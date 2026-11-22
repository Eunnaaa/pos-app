import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { receipts, refunds, salesOrderItems, salesOrders, salesPayments, salesReturns } from "@/db/schema";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { AppError, assertBranchAccess } from "@/lib/server";

export const GET = apiHandler(async (request) => {
  const id = z.string().uuid().parse(new URL(request.url).pathname.split("/").filter(Boolean).at(-1));
  const context = await requireApiContext(request, "sales:read");
  const [order] = await db.select().from(salesOrders).where(and(eq(salesOrders.id, id), eq(salesOrders.organizationId, context.organizationId))).limit(1);
  if (!order) throw new AppError("NOT_FOUND", "Sales order not found");
  assertBranchAccess(context.tenant, order.branchId);
  const [items, payments, receipt, orderRefunds] = await Promise.all([
    db.select().from(salesOrderItems).where(eq(salesOrderItems.orderId, id)),
    db.select().from(salesPayments).where(eq(salesPayments.orderId, id)),
    db.select().from(receipts).where(eq(receipts.orderId, id)).limit(1),
    db.select({
      id: refunds.id, amount: refunds.amount, status: refunds.status,
      externalReference: refunds.externalReference, method: salesPayments.method, provider: salesPayments.provider,
      cashSessionId: refunds.cashSessionId,
    }).from(refunds).innerJoin(salesReturns, eq(salesReturns.id, refunds.returnId))
      .leftJoin(salesPayments, eq(salesPayments.id, refunds.paymentId))
      .where(and(eq(salesReturns.orderId, id), eq(refunds.organizationId, context.organizationId))),
  ]);
  return dataResponse({ order, items, payments, receipt: receipt[0], refunds: orderRefunds });
});
