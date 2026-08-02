import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { receipts, salesOrderItems, salesOrders, salesPayments } from "@/db/schema";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { AppError } from "@/lib/server";

export const GET = apiHandler(async (request) => {
  const id = z.string().uuid().parse(new URL(request.url).pathname.split("/").filter(Boolean).at(-1));
  const context = await requireApiContext(request, "sales:read");
  const [order] = await db.select().from(salesOrders).where(and(eq(salesOrders.id, id), eq(salesOrders.organizationId, context.organizationId))).limit(1);
  if (!order) throw new AppError("NOT_FOUND", "Sales order not found");
  const [items, payments, receipt] = await Promise.all([
    db.select().from(salesOrderItems).where(eq(salesOrderItems.orderId, id)),
    db.select().from(salesPayments).where(eq(salesPayments.orderId, id)),
    db.select().from(receipts).where(eq(receipts.orderId, id)).limit(1),
  ]);
  return dataResponse({ order, items, payments, receipt: receipt[0] });
});
