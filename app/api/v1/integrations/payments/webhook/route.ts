import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  branches,
  organizations,
  salesOrders,
  salesPayments,
  subscriptionInvoices,
  tenantMembers,
  user,
  type PlanTier,
} from "@/db/schema";
import { apiHandler, dataResponse } from "@/lib/api";
import { getServerEnv } from "@/config/env";
import { AppError, decryptSecret, safeEqualSecret } from "@/lib/server";
import { sendSubscriptionSuccessEmail } from "@/lib/integrations/notifications";
import { confirmOrderPayment } from "@/lib/services/order-confirmation";
import { upgradeSubscription } from "@/lib/services/subscription";
import {
  generateDokuDigest,
  isOrderFullySettled,
  parseGatewayAmount,
  verifyDokuSignature,
  verifyMidtransNotificationSignature,
} from "@/lib/integrations/payments";
import { PLANS } from "@/config/plans";

const midtransSchema = z.object({
  order_id: z.string(),
  transaction_status: z.string(),
  status_code: z.string(),
  gross_amount: z.string(),
  signature_key: z.string(),
  transaction_id: z.string().optional(),
  fraud_status: z.string().optional(),
  currency: z.string().optional(),
});

const xenditSchema = z.object({
  external_id: z.string(),
  status: z.string(),
  paid_amount: z.number().optional(),
  id: z.string().optional(),
});

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

function mapDokuStatus(status: string): "settled" | "failed" | null {
  if (["SUCCESS", "PAID", "SETTLED"].includes(status.toUpperCase())) return "settled";
  if (["FAILED", "EXPIRED", "CANCELLED", "DENY"].includes(status.toUpperCase())) return "failed";
  return null;
}

async function processPaymentUpdate(
  orderRef: string,
  newStatus: "settled" | "failed",
  externalRef: string,
  provider: string,
  reportedAmount?: bigint,
) {
  // Normalize snap order_id if it ends with -snap
  const cleanOrderRef = orderRef.replace(/-snap$/, "");
  if (newStatus === "settled" && reportedAmount === undefined) {
    throw new AppError("VALIDATION_ERROR", "Successful payment notification must include a valid amount");
  }

  return db.transaction(async (tx) => {
    // 1. Check if this is a Subscription Invoice
    if (cleanOrderRef.startsWith("SUB-")) {
      const [invoice] = await tx
        .select()
        .from(subscriptionInvoices)
        .where(eq(subscriptionInvoices.invoiceNumber, cleanOrderRef))
        .limit(1);

      if (!invoice) return dataResponse({ status: "ignored", reason: "subscription_invoice_not_found" }, { status: 200 });
      if (invoice.status === "paid") {
        return dataResponse({ status: "no_change", reason: "subscription_already_paid" }, { status: 200 });
      }
      if (invoice.paymentProvider && invoice.paymentProvider !== provider) {
        throw new AppError("CONFLICT", "Payment provider does not match subscription invoice");
      }
      if (reportedAmount !== undefined && reportedAmount !== BigInt(invoice.amount)) {
        throw new AppError("CONFLICT", "Payment amount does not match subscription invoice");
      }

      if (newStatus === "settled") {
        await tx
          .update(subscriptionInvoices)
          .set({
            status: "paid",
            paidAt: new Date(),
            paymentReference: externalRef,
            paymentProvider: provider,
            updatedAt: new Date(),
          })
          .where(eq(subscriptionInvoices.id, invoice.id));

        const meta = (invoice.metadata || {}) as { plan?: PlanTier; billingCycle?: "monthly" | "yearly" };
        const plan = meta.plan || "pro";
        const billingCycle = meta.billingCycle || "monthly";

        const updatedSub = await upgradeSubscription(invoice.organizationId, {
          plan,
          billingCycle,
          paymentProvider: provider,
          externalSubscriptionId: externalRef,
        });

        // Send Subscription Confirmation Letter Email asynchronously
        const [org] = await tx
          .select({ name: organizations.name, email: organizations.email })
          .from(organizations)
          .where(eq(organizations.id, invoice.organizationId))
          .limit(1);

        const [ownerMember] = await tx
          .select({ name: user.name, email: user.email })
          .from(tenantMembers)
          .innerJoin(user, eq(user.id, tenantMembers.userId))
          .where(and(eq(tenantMembers.organizationId, invoice.organizationId), eq(tenantMembers.role, "owner")))
          .limit(1);

        const targetEmail = ownerMember?.email || org?.email;
        if (targetEmail) {
          const planConfig = PLANS[plan] || PLANS.pro;
          void sendSubscriptionSuccessEmail(targetEmail, {
            userName: ownerMember?.name || "Owner",
            businessName: org?.name || "Kedai-Ku",
            planName: planConfig.name,
            invoiceNumber: cleanOrderRef,
            amount: Number(invoice.amount),
            billingCycle,
            periodEnd: updatedSub.currentPeriodEnd || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          });
        }

        return dataResponse({ status: "subscription_activated", invoiceNumber: cleanOrderRef, plan, provider }, { status: 200 });
      } else if (newStatus === "failed") {
        await tx
          .update(subscriptionInvoices)
          .set({
            status: "failed",
            paymentReference: externalRef,
            updatedAt: new Date(),
          })
          .where(eq(subscriptionInvoices.id, invoice.id));

        return dataResponse({ status: "subscription_payment_failed", invoiceNumber: cleanOrderRef, provider }, { status: 200 });
      }
    }

    // 2. POS / Self-Order Sales Order Payment
    const [order] = await tx
      .select({
        id: salesOrders.id,
        organizationId: salesOrders.organizationId,
        branchId: salesOrders.branchId,
        orderNumber: salesOrders.orderNumber,
        totalAmount: salesOrders.totalAmount,
        changeAmount: salesOrders.changeAmount,
        status: salesOrders.status,
        cashierUserId: salesOrders.cashierUserId,
      })
      .from(salesOrders)
      .where(eq(salesOrders.orderNumber, cleanOrderRef))
      .limit(1);

    if (!order) return dataResponse({ status: "ignored", reason: "order_not_found" }, { status: 200 });
    const payments = await tx
      .select({
        id: salesPayments.id,
        method: salesPayments.method,
        amount: salesPayments.amount,
        status: salesPayments.status,
        provider: salesPayments.provider,
      })
      .from(salesPayments)
      .where(and(
        eq(salesPayments.orderId, order.id),
        eq(salesPayments.provider, provider),
        inArray(salesPayments.status, ["authorized", "pending"]),
      ));

    if (payments.length === 0 && order.status === "paid") {
      return dataResponse({ status: "no_change", order: orderRef, reason: "already_paid" }, { status: 200 });
    }

    if (payments.length !== 1) {
      return dataResponse({ status: "ignored", order: orderRef, reason: payments.length === 0 ? "matching_payment_not_found" : "ambiguous_payments" }, { status: 200 });
    }
    const payment = payments[0];
    if (reportedAmount !== undefined && reportedAmount !== payment.amount) {
      throw new AppError("CONFLICT", "Payment amount does not match payment record");
    }
    const updatedPayments = await tx
      .update(salesPayments)
      .set({
        status: newStatus,
        externalReference: externalRef,
        paidAt: newStatus === "settled" ? new Date() : undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(salesPayments.id, payment.id), inArray(salesPayments.status, ["authorized", "pending"])))
      .returning({ id: salesPayments.id });

    // A duplicate/concurrent notification may have observed the old state but
    // lost the conditional update race. It must not replay stock or ledger side effects.
    if (updatedPayments.length === 0) {
      return dataResponse({ status: "no_change", order: orderRef, reason: "payment_already_processed" }, { status: 200 });
    }

    if (newStatus === "settled" && order.status !== "paid") {
      const allPayments = await tx
        .select({ amount: salesPayments.amount, status: salesPayments.status })
        .from(salesPayments)
        .where(eq(salesPayments.orderId, order.id));
      if (isOrderFullySettled(order.totalAmount, allPayments)) {
        await confirmOrderPayment(tx, {
          organizationId: order.organizationId,
          orderId: order.id,
          actorUserId: order.cashierUserId ?? null,
        });
      }
    }

    return dataResponse({ status: "updated", order: orderRef, provider, newStatus, paymentsUpdated: payments.length }, { status: 200 });
  }).then((response) => response);
}

export const POST = apiHandler(async (request) => {
  const env = getServerEnv();
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > 256 * 1024) {
    throw new AppError("VALIDATION_ERROR", "Webhook payload is too large");
  }
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > 256 * 1024) {
    throw new AppError("VALIDATION_ERROR", "Webhook payload is too large");
  }
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return dataResponse({ status: "ignored", reason: "invalid_json" }, { status: 400 });
  }

  // 1. Check DOKU Notification
  const isDoku =
    ("order" in body && typeof body.order === "object" && body.order !== null && "invoice_number" in body.order) ||
    ("transactionDetails" in body && typeof body.transactionDetails === "object") ||
    request.headers.has("client-id") ||
    request.headers.has("x-partner-id");

  if (isDoku) {
    if (!env.DOKU_SECRET_KEY || !env.DOKU_CLIENT_ID) {
      throw new AppError("BAD_REQUEST", "DOKU webhook is not configured");
    }
    const dokuOrder = body.order as { invoice_number?: string } | undefined;
    const dokuTx = body.transaction as { status?: string } | undefined;
    const dokuSnapDetails = body.transactionDetails as { orderId?: string } | undefined;

    const orderRef = dokuOrder?.invoice_number || dokuSnapDetails?.orderId;
    if (orderRef) {
      const dokuStatus = dokuTx?.status;
      if (!dokuStatus) throw new AppError("VALIDATION_ERROR", "Missing DOKU transaction status");
      const newStatus = mapDokuStatus(dokuStatus);

      const dokuSignature = request.headers.get("signature") || request.headers.get("x-signature");
      const dokuClientId = request.headers.get("client-id") || request.headers.get("x-partner-id") || "";
      const dokuRequestId = request.headers.get("request-id") || request.headers.get("x-external-id") || "";
      const dokuTimestamp = request.headers.get("request-timestamp") || request.headers.get("x-timestamp") || "";
      const targetPath = new URL(request.url).pathname;

      if (!dokuSignature || !dokuClientId || !dokuRequestId || !dokuTimestamp) {
        throw new AppError("UNAUTHENTICATED", "Missing DOKU signature headers");
      }
      if (!safeEqualSecret(dokuClientId, env.DOKU_CLIENT_ID)) {
        throw new AppError("UNAUTHENTICATED", "Invalid DOKU client ID");
      }
      const notificationTime = Date.parse(dokuTimestamp);
      if (!Number.isFinite(notificationTime) || Math.abs(Date.now() - notificationTime) > 5 * 60_000) {
        throw new AppError("UNAUTHENTICATED", "DOKU notification timestamp has expired");
      }
      const digest = generateDokuDigest(rawBody);
      const isValid = verifyDokuSignature(dokuClientId, dokuRequestId, dokuTimestamp, targetPath, digest, dokuSignature, env.DOKU_SECRET_KEY);
      if (!isValid) {
        throw new AppError("UNAUTHENTICATED", "Invalid DOKU signature");
      }

      if (!newStatus) return dataResponse({ status: "ignored", reason: `unmapped_status:${dokuStatus}` }, { status: 200 });
      const dokuAmount = parseGatewayAmount((dokuOrder as { amount?: unknown } | undefined)?.amount);
      return await processPaymentUpdate(orderRef, newStatus, dokuRequestId || orderRef, "doku", dokuAmount);
    }
  }

  // 2. Check Midtrans Notification
  const isMidtrans = "signature_key" in body && "transaction_status" in body;
  if (isMidtrans) {
    const input = midtransSchema.parse(body);
    const orderRef = input.order_id;
    const cleanOrderRef = orderRef.replace(/-snap$/, "");

    // Resolve active server key: branch specific vs platform
    let validServerKey = env.MIDTRANS_SERVER_KEY || "";
    const [paymentOrder] = await db
      .select({ branchId: salesOrders.branchId })
      .from(salesOrders)
      .where(eq(salesOrders.orderNumber, cleanOrderRef))
      .limit(1);

    if (paymentOrder?.branchId) {
      const [branchRow] = await db
        .select({ metadata: branches.metadata })
        .from(branches)
        .where(eq(branches.id, paymentOrder.branchId))
        .limit(1);
      const bMeta = (branchRow?.metadata as Record<string, unknown>) || {};
      if (bMeta.midtransServerKey) {
        validServerKey = decryptSecret(bMeta.midtransServerKey).trim();
      }
    }

    if (!validServerKey) throw new AppError("BAD_REQUEST", "Midtrans server key not configured");
    if (!verifyMidtransNotificationSignature({
      orderId: input.order_id,
      statusCode: input.status_code,
      grossAmount: input.gross_amount,
      signature: input.signature_key,
      serverKey: validServerKey,
    })) {
      throw new AppError("UNAUTHENTICATED", "Invalid Midtrans signature");
    }
    if (["capture", "settlement"].includes(input.transaction_status)) {
      if (input.status_code !== "200") throw new AppError("CONFLICT", "Midtrans success notification has an invalid status code");
      if (input.fraud_status && input.fraud_status.toLowerCase() !== "accept") {
        return dataResponse({ status: "ignored", reason: `fraud_status:${input.fraud_status}` }, { status: 200 });
      }
      if (input.currency && input.currency !== "IDR") throw new AppError("CONFLICT", "Midtrans currency must be IDR");
    }
    const newStatus = mapMidtransStatus(input.transaction_status);
    if (!newStatus) return dataResponse({ status: "ignored", reason: `unmapped_status:${input.transaction_status}` }, { status: 200 });

    return await processPaymentUpdate(orderRef, newStatus, input.transaction_id ?? input.order_id, "midtrans", parseGatewayAmount(input.gross_amount));
  }

  // 3. Check Xendit Notification
  const isXendit = "external_id" in body && "status" in body && !isMidtrans;
  if (isXendit) {
    const input = xenditSchema.parse(body);
    const callbackToken = request.headers.get("x-callback-token");
    if (!env.XENDIT_CALLBACK_TOKEN) throw new AppError("BAD_REQUEST", "Xendit callback token not configured");
    if (!callbackToken || !safeEqualSecret(callbackToken, env.XENDIT_CALLBACK_TOKEN)) {
      throw new AppError("UNAUTHENTICATED", "Invalid Xendit callback token");
    }
    const newStatus = mapXenditStatus(input.status);
    if (!newStatus) return dataResponse({ status: "ignored", reason: `unmapped_status:${input.status}` }, { status: 200 });

    const orderRef = input.external_id;
    return await processPaymentUpdate(orderRef, newStatus, input.id ?? input.external_id, "xendit", parseGatewayAmount(input.paid_amount));
  }

  return dataResponse({ status: "ignored", reason: "unknown_provider" }, { status: 200 });
});
