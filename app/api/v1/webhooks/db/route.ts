import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { customers, receipts, salesOrders } from "@/db/schema";
import { apiHandler, dataResponse } from "@/lib/api";
import { getServerEnv } from "@/config/env";
import { sendEmail, sendWhatsApp } from "@/lib/integrations";
import { AppError } from "@/lib/server";

type WebhookPayload = { type: string; table: string; record?: { id?: string; status?: string } };

export const POST = apiHandler(async (request) => {
  const env = getServerEnv();
  if (!env.WEBHOOK_SECRET) throw new AppError("BAD_REQUEST", "WEBHOOK_SECRET belum dikonfigurasi");
  const auth = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!auth || auth !== env.WEBHOOK_SECRET) throw new AppError("FORBIDDEN", "Invalid webhook secret");

  const payload = await request.json() as WebhookPayload;
  if (payload.table !== "sales_orders" || payload.type !== "INSERT" || payload.record?.status !== "paid" || !payload.record.id) {
    return dataResponse({ handled: false });
  }

  const [order] = await db.select({
    id: salesOrders.id,
    orderNumber: salesOrders.orderNumber,
    organizationId: salesOrders.organizationId,
    totalAmount: salesOrders.totalAmount,
    customerName: customers.name,
    customerPhone: customers.phone,
    customerEmail: customers.email,
  })
    .from(salesOrders)
    .leftJoin(customers, eq(customers.id, salesOrders.customerId))
    .where(and(eq(salesOrders.id, payload.record.id)))
    .limit(1);

  if (!order) throw new AppError("NOT_FOUND", "Order not found");
  const [receipt] = await db.select({ id: receipts.id, whatsappSentAt: receipts.whatsappSentAt, emailSentAt: receipts.emailSentAt }).from(receipts).where(eq(receipts.orderId, order.id)).limit(1);

  const message = `Pembayaran ${order.orderNumber} berhasil. Total: Rp ${Number(order.totalAmount).toLocaleString("id-ID")}. Terima kasih sudah berbelanja.`;
  const sent: string[] = [];

  if (order.customerPhone && !receipt?.whatsappSentAt) {
    try { await sendWhatsApp(order.customerPhone, message); sent.push("whatsapp") } catch { /* non-fatal */ }
  }
  if (order.customerEmail && !receipt?.emailSentAt) {
    try { await sendEmail(order.customerEmail, `Struk ${order.orderNumber}`, `<p>${message}</p>`); sent.push("email") } catch { /* non-fatal */ }
  }

  return dataResponse({ handled: true, channels: sent });
});