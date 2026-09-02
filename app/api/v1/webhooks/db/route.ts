import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, receipts, salesOrders } from "@/db/schema";
import { apiHandler, dataResponse } from "@/lib/api";
import { getServerEnv } from "@/config/env";
import { sendEmail, sendWhatsApp } from "@/lib/integrations";
import { AppError } from "@/lib/server";
import { logger } from "@/lib/server/logger";
import { safeEqualSecret } from "@/lib/server";
import { z } from "zod";

const webhookSchema = z.object({
  type: z.string().max(30),
  table: z.string().max(100),
  record: z.object({
    id: z.string().uuid().optional(),
    status: z.string().max(50).optional(),
  }).optional(),
});

export const POST = apiHandler(async (request) => {
  const env = getServerEnv();
  if (!env.WEBHOOK_SECRET) throw new AppError("BAD_REQUEST", "WEBHOOK_SECRET belum dikonfigurasi");
  const auth = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!auth || !safeEqualSecret(auth, env.WEBHOOK_SECRET)) throw new AppError("FORBIDDEN", "Invalid webhook secret");

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > 64 * 1024) throw new AppError("VALIDATION_ERROR", "Webhook payload is too large");
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > 64 * 1024) throw new AppError("VALIDATION_ERROR", "Webhook payload is too large");
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    throw new AppError("VALIDATION_ERROR", "Invalid JSON payload");
  }
  const payload = webhookSchema.parse(json);
  if (payload.table !== "sales_orders" || !["INSERT", "UPDATE"].includes(payload.type) || payload.record?.status !== "paid" || !payload.record.id) {
    return dataResponse({ handled: false });
  }

  const outcome = await db.transaction(async (tx) => {
    // Serialize notifications per order so duplicate INSERT/UPDATE webhooks do
    // not send both channels twice while their sent markers are still empty.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${payload.record!.id!}, 0))`);
    const [order] = await tx.select({
      id: salesOrders.id,
      orderNumber: salesOrders.orderNumber,
      organizationId: salesOrders.organizationId,
      totalAmount: salesOrders.totalAmount,
      status: salesOrders.status,
      customerName: customers.name,
      customerPhone: customers.phone,
      customerEmail: customers.email,
    })
      .from(salesOrders)
      .leftJoin(customers, eq(customers.id, salesOrders.customerId))
      .where(and(eq(salesOrders.id, payload.record!.id!)))
      .limit(1);

    if (!order) throw new AppError("NOT_FOUND", "Order not found");
    if (order.status !== "paid") return { handled: false, sent: [] as string[], failed: [] as string[] };
    const [receipt] = await tx.select({ id: receipts.id, whatsappSentAt: receipts.whatsappSentAt, emailSentAt: receipts.emailSentAt }).from(receipts).where(eq(receipts.orderId, order.id)).limit(1);
    if (!receipt) throw new AppError("CONFLICT", "Paid order receipt is not ready");

    const message = `Pembayaran ${order.orderNumber} berhasil. Total: Rp ${Number(order.totalAmount).toLocaleString("id-ID")}. Terima kasih sudah berbelanja.`;
    const sent: string[] = [];
    const failed: string[] = [];

    if (order.customerPhone && !receipt.whatsappSentAt) {
      try { await sendWhatsApp(order.customerPhone, message); sent.push("whatsapp"); } catch { failed.push("whatsapp"); }
    }
    if (order.customerEmail && !receipt.emailSentAt) {
      try { await sendEmail(order.customerEmail, `Struk ${order.orderNumber}`, `<p>${message}</p>`); sent.push("email"); } catch { failed.push("email"); }
    }

    if (sent.length) {
      await tx.update(receipts).set({
        ...(sent.includes("whatsapp") ? { whatsappSentAt: new Date() } : {}),
        ...(sent.includes("email") ? { emailSentAt: new Date() } : {}),
        updatedAt: new Date(),
      }).where(eq(receipts.id, receipt.id));
    }
    return { handled: true, sent, failed };
  });

  if (outcome.failed.length) {
    logger.error("receipt notification delivery failed", { orderId: payload.record.id, channels: outcome.failed });
    throw new AppError("INTERNAL_ERROR", "Receipt notification delivery failed");
  }
  return dataResponse({ handled: outcome.handled, channels: outcome.sent });
});
