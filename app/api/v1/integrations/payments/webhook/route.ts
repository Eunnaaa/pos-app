import { createHash } from "node:crypto";
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
import { AppError } from "@/lib/server";
import { sendSubscriptionSuccessEmail } from "@/lib/integrations/notifications";
import { confirmOrderPayment } from "@/lib/services/order-confirmation";
import { upgradeSubscription } from "@/lib/services/subscription";
import { PLANS } from "@/config/plans";

const midtransSchema = z.object({
  order_id: z.string(),
  transaction_status: z.string(),
  status_code: z.string(),
  gross_amount: z.string(),
  signature_key: z.string(),
  transaction_id: z.string().optional(),
});

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
  // Normalize snap order_id if it ends with -snap
  const cleanOrderRef = orderRef.replace(/-snap$/, "");

  return db.transaction(async (tx) => {
    // 1. Check if this is a Subscription Invoice
    if (cleanOrderRef.startsWith("SUB-")) {
      const [invoice] = await tx
        .select()
        .from(subscriptionInvoices)
        .where(eq(subscriptionInvoices.invoiceNumber, cleanOrderRef))
        .limit(1);

      if (!invoice) return dataResponse({ status: "ignored", reason: "subscription_invoice_not_found" }, { status: 200 });

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
      })
      .from(salesPayments)
      .where(and(eq(salesPayments.orderId, order.id), inArray(salesPayments.status, ["authorized", "pending"])));

    if (payments.length === 0 && order.status === "paid") {
      return dataResponse({ status: "no_change", order: orderRef, reason: "already_paid" }, { status: 200 });
    }

    for (const payment of payments) {
      await tx
        .update(salesPayments)
        .set({
          status: newStatus,
          externalReference: externalRef,
          paidAt: newStatus === "settled" ? new Date() : undefined,
          updatedAt: new Date(),
        })
        .where(eq(salesPayments.id, payment.id));
    }

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
  const body = (await request.json()) as Record<string, unknown>;

  const isMidtrans = "signature_key" in body && "transaction_status" in body;
  const isXendit = "external_id" in body && "status" in body && !isMidtrans;

  if (!isMidtrans && !isXendit) {
    return dataResponse({ status: "ignored", reason: "unknown_provider" }, { status: 200 });
  }

  if (isMidtrans) {
    const input = midtransSchema.parse(body);
    const orderRef = input.order_id;
    const cleanOrderRef = orderRef.replace(/-snap$/, "");

    // Resolve active server key: branch specific vs platform
    let validServerKey = env.MIDTRANS_SERVER_KEY || "";
    if (cleanOrderRef.startsWith("SO-")) {
      const [order] = await db
        .select({ branchId: salesOrders.branchId })
        .from(salesOrders)
        .where(eq(salesOrders.orderNumber, cleanOrderRef))
        .limit(1);

      if (order?.branchId) {
        const [branchRow] = await db
          .select({ metadata: branches.metadata })
          .from(branches)
          .where(eq(branches.id, order.branchId))
          .limit(1);
        const bMeta = (branchRow?.metadata as Record<string, unknown>) || {};
        if (bMeta.midtransServerKey) {
          validServerKey = String(bMeta.midtransServerKey).trim();
        }
      }
    }

    if (!validServerKey) throw new AppError("BAD_REQUEST", "Midtrans server key not configured");
    if (!verifyMidtransSignature(input.order_id, input.status_code, input.gross_amount, input.signature_key, validServerKey)) {
      throw new AppError("UNAUTHENTICATED", "Invalid Midtrans signature");
    }
    const newStatus = mapMidtransStatus(input.transaction_status);
    if (!newStatus) return dataResponse({ status: "ignored", reason: `unmapped_status:${input.transaction_status}` }, { status: 200 });

    return await processPaymentUpdate(orderRef, newStatus, input.transaction_id ?? input.order_id, "midtrans");
  }


  const input = xenditSchema.parse(body);
  const callbackToken = request.headers.get("x-callback-token");
  if (!env.XENDIT_SECRET_KEY) throw new AppError("BAD_REQUEST", "Xendit not configured");
  if (!callbackToken || callbackToken !== env.XENDIT_SECRET_KEY) {
    throw new AppError("UNAUTHENTICATED", "Invalid Xendit callback token");
  }
  const newStatus = mapXenditStatus(input.status);
  if (!newStatus) return dataResponse({ status: "ignored", reason: `unmapped_status:${input.status}` }, { status: 200 });

  const orderRef = input.external_id;
  return await processPaymentUpdate(orderRef, newStatus, input.id ?? input.external_id, "xendit");
});
