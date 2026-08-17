import { z } from "zod";
import { eq } from "drizzle-orm";
import { apiHandler, dataResponse } from "@/lib/api";
import { db } from "@/db";
import { salesOrders } from "@/db/schema";
import { AppError } from "@/lib/server";
import { requireSelfOrderContext } from "@/lib/server/self-order-context";
import { getOrderStatus } from "@/lib/services/self-order";

const schema = z.object({ id: z.string().uuid() });

export const GET = apiHandler(async (request) => {
  const url = new URL(request.url);
  const id = url.pathname.split("/").at(-2)!;
  const orderId = schema.parse({ id }).id;
  const context = await requireSelfOrderContext(request);

  // Verifikasi ownership: order.tableId = context.tableId
  const [order] = await db
    .select({ id: salesOrders.id, organizationId: salesOrders.organizationId, tableId: salesOrders.tableId })
    .from(salesOrders)
    .where(eq(salesOrders.id, orderId))
    .limit(1);
  if (!order || order.organizationId !== context.organizationId) {
    throw new AppError("NOT_FOUND", "Order tidak ditemukan");
  }
  if (order.tableId && order.tableId !== context.tableId) {
    throw new AppError("FORBIDDEN", "Order bukan milik meja token ini");
  }

  const timeline = await getOrderStatus(orderId);
  return dataResponse(timeline, { status: 200, headers: { "cache-control": "no-store" } });
});
