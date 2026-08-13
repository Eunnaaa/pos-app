import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { salesOrders, salesPayments } from "@/db/schema";
import { apiHandler, dataResponse } from "@/lib/api";
import { getServerEnv } from "@/config/env";
import { AppError } from "@/lib/server";
import { confirmOrderPayment } from "@/lib/services/order-confirmation";

// Midtrans notification body
const midtransSchema = z.object({
  order_id: z.string(),
  transaction_status: z.string(),
  status_code: z.string(),
  gross_amount: z.string(),
  signature_key: z.string(),
  transaction_id: z.string().optional(),
});

// Xendit notification body (simplified)
const xenditSchema = z.object({
  external_id: z.string(),
  status: z.string(),
  paid_amount: z.number().optional(),
  id: z.string().optional(),
});

function verifyMidtransSignature(orderId: string, statusCode: string, grossAmount: string, signatureKey: string, serverKey: string): boolean {
  const expected = createHash("sha512").update(`${orderId}${statusCode}${grossAmount}${serverKey}`).digest("hex");
  return expected === signatureKey;
}

function mapMidtransStatus(status: string): "settled" | "failed" | null {
  if (["capture", "settlement"].includes(status)) return "settled";
  if (["deny", "cancel", "expire", "failure"].includes(status)) return "failed";
  return null;
}

function mapXenditStatus(status: string): "settled" | "failed" | null {
  if (status.toUpperCase() === "PAID") return "settled";
  if (["EXPIRED", "FAILED"].includes(status.toUpperCase())) return "failed";
  return null;
}

async function processPaymentUpdate(orderRef: string, newStatus: "settled" | "failed", externalRef: string, provider: string) {
  return db.transaction(async (tx) => {
    // Find order by order_number
    const [order] = await tx.select({
      id: salesOrders.id, organizationId: salesOrders.organizationId, branchId: salesOrders.branchId,
      orderNumber: salesOrders.orderNumber, totalAmount: salesOrders.totalAmount,
      changeAmount: salesOrders.changeAmount, status: salesOrders.status,
      cashierUserId: salesOrders.cashierUserId,
    }).from(salesOrders).where(and(eq(salesOrders.orderNumber, orderRef))).limit(1);

    if (!order) return dataResponse({ status: "ignored", reason: "order_not_found" }, { status: 200 });

    // Find authorized payments for this order
    const payments = await tx.select({
      id: salesPayments.id, method: salesPayments.method, amount: salesPayments.amount, status: salesPayments.status,
    }).from(salesPayments).where(and(
      eq(salesPayments.orderId, order.id),
      eq(salesPayments.status, "authorized"),
    ));

    if (payments.length === 0) {
      // No authorized payments to update — maybe already settled
      return dataResponse({ status: "no_change", order: orderRef, reason: "no_authorized_payments" }, { status: 200 });
    }

    for (const payment of payments) {
      await tx.update(salesPayments).set({
        status: newStatus,
        externalReference: externalRef,
        paidAt: newStatus === "settled" ? new Date() : undefined,
        updatedAt: new Date(),
      }).where(and(eq(salesPayments.id, payment.id), eq(salesPayments.status, "authorized")));
    }

    // If settling, run the full order confirmation: stock decrement, kitchen ticket,
    // loyalty points, ledger posting, receipt, and mark order as paid.
    // Previously this only posted to the ledger (with a totalAmount:0n bug) and skipped
    // stock, kitchen, loyalty, and receipt — leaving online-paid orders incomplete.
    if (newStatus === "settled" && order.status !== "paid") {
      await confirmOrderPayment(tx, {
        organizationId: order.organizationId,
        orderId: order.id,
        actorUserId: order.cashierUserId ?? null,
      });
    }

    return dataResponse({ status: "updated", order: orderRef, provider, newStatus, paymentsUpdated: payments.length }, { status: 200 });
  }).then((response) => response);
}

export const POST = apiHandler(async (request) => {
  const env = getServerEnv();
  const body = await request.json() as Record<string, unknown>;

  // Detect provider from body structure
  const isMidtrans = "signature_key" in body && "transaction_status" in body;
  const isXendit = "external_id" in body && "status" in body && !isMidtrans;

  if (!isMidtrans && !isXendit) {
    return dataResponse({ status: "ignored", reason: "unknown_provider" }, { status: 200 });
  }

  if (isMidtrans) {
    const input = midtransSchema.parse(body);
    if (!env.MIDTRANS_SERVER_KEY) throw new AppError("BAD_REQUEST", "Midtrans not configured");
    if (!verifyMidtransSignature(input.order_id, input.status_code, input.gross_amount, input.signature_key, env.MIDTRANS_SERVER_KEY)) {
      throw new AppError("UNAUTHENTICATED", "Invalid Midtrans signature");
    }
    const newStatus = mapMidtransStatus(input.transaction_status);
    if (!newStatus) return dataResponse({ status: "ignored", reason: `unmapped_status:${input.transaction_status}` }, { status: 200 });

    const orderRef = input.order_id;
    return await processPaymentUpdate(orderRef, newStatus, input.transaction_id ?? input.order_id, "midtrans");
  }

  // Xendit
  const input = xenditSchema.parse(body);
  const callbackToken = request.headers.get("x-callback-token");
  if (env.XENDIT_SECRET_KEY && callbackToken !== env.XENDIT_SECRET_KEY) {
    throw new AppError("UNAUTHENTICATED", "Invalid Xendit callback token");
  }
  const newStatus = mapXenditStatus(input.status);
  if (!newStatus) return dataResponse({ status: "ignored", reason: `unmapped_status:${input.status}` }, { status: 200 });

  const orderRef = input.external_id;
  return await processPaymentUpdate(orderRef, newStatus, input.id ?? input.external_id, "xendit");
});
