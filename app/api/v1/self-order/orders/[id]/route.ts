import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { salesOrders, salesPayments } from "@/db/schema";
import { apiHandler, dataResponse } from "@/lib/api";
import { AppError } from "@/lib/server";
import { requireSelfOrderContext } from "@/lib/server/self-order-context";
import { confirmOrderPayment } from "@/lib/services/order-confirmation";
import { getOrderStatus } from "@/lib/services/self-order";

const schema = z.object({ id: z.string().uuid() });

export const GET = apiHandler(async (request) => {
  const url = new URL(request.url);
  const id = url.pathname.split("/").filter(Boolean).at(-1)!;
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

export const POST = apiHandler(async (request) => {
  const url = new URL(request.url);
  const id = url.pathname.split("/").filter(Boolean).at(-1)!;
  const orderId = schema.parse({ id }).id;
  const context = await requireSelfOrderContext(request);

  const [order] = await db
    .select({
      id: salesOrders.id,
      organizationId: salesOrders.organizationId,
      branchId: salesOrders.branchId,
      tableId: salesOrders.tableId,
      status: salesOrders.status,
      totalAmount: salesOrders.totalAmount,
    })
    .from(salesOrders)
    .where(eq(salesOrders.id, orderId))
    .limit(1);

  if (!order || order.organizationId !== context.organizationId) {
    throw new AppError("NOT_FOUND", "Order tidak ditemukan");
  }
  if (order.tableId && order.tableId !== context.tableId) {
    throw new AppError("FORBIDDEN", "Order bukan milik meja token ini");
  }

  // Selesaikan pembayaran, kurangi stok, buat tiket dapur KDS, dan catat ke transaksi
  if (order.status !== "paid") {
    await db.transaction(async (tx) => {
      await tx
        .update(salesPayments)
        .set({
          status: "settled",
          paidAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(salesPayments.orderId, order.id), inArray(salesPayments.status, ["authorized", "pending"])));

      await confirmOrderPayment(tx, {
        organizationId: order.organizationId,
        orderId: order.id,
        actorUserId: null,
      });
    });
  }

  const timeline = await getOrderStatus(orderId);
  return dataResponse(timeline, { status: 200 });
});
