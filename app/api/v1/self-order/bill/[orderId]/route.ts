import { z } from "zod";
import { eq } from "drizzle-orm";
import { apiHandler, dataResponse } from "@/lib/api";
import { db } from "@/db";
import { salesOrders } from "@/db/schema";
import { AppError } from "@/lib/server";
import { requireSelfOrderContext } from "@/lib/server/self-order-context";
import { getTableBillSplit } from "@/lib/services/self-order";

const schema = z.object({ orderId: z.string().uuid() });

export const GET = apiHandler(async (request) => {
  const url = new URL(request.url);
  const orderId = schema.parse({ orderId: url.pathname.split("/").at(-2)! }).orderId;
  const context = await requireSelfOrderContext(request);

  // Resolve tableId dari order pertama (parent if ada)
  const [order] = await db
    .select({ id: salesOrders.id, organizationId: salesOrders.organizationId, tableId: salesOrders.tableId })
    .from(salesOrders)
    .where(eq(salesOrders.id, orderId))
    .limit(1);
  if (!order || order.organizationId !== context.organizationId) {
    throw new AppError("NOT_FOUND", "Order tidak ditemukan");
  }
  const tableId = order.tableId ?? context.tableId;
  if (tableId !== context.tableId) {
    throw new AppError("FORBIDDEN", "Bill bukan milik meja token ini");
  }

  const result = await getTableBillSplit(tableId);
  return dataResponse(result, { status: 200, headers: { "cache-control": "no-store" } });
});
