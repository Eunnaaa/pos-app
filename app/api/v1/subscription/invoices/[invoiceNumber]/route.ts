import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  organizations,
  subscriptionInvoices,
  tenantMembers,
  user,
  type PlanTier,
} from "@/db/schema";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { AppError } from "@/lib/server";
import { checkDokuTransactionStatus, checkMidtransTransactionStatus } from "@/lib/integrations/payments";
import { upgradeSubscription } from "@/lib/services/subscription";
import { sendSubscriptionSuccessEmail } from "@/lib/integrations/notifications";
import { PLANS } from "@/config/plans";

export const GET = apiHandler(async (request) => {
  const context = await requireApiContext(request, "dashboard:read");
  const invoiceNumber = new URL(request.url).pathname.split("/").filter(Boolean).at(-1);

  if (!invoiceNumber) {
    throw new AppError("BAD_REQUEST", "Nomor tagihan diperlukan");
  }

  const [invoice] = await db
    .select()
    .from(subscriptionInvoices)
    .where(
      and(
        eq(subscriptionInvoices.organizationId, context.organizationId),
        eq(subscriptionInvoices.invoiceNumber, invoiceNumber),
      ),
    )
    .limit(1);

  if (!invoice) {
    throw new AppError("NOT_FOUND", `Tagihan ${invoiceNumber} tidak ditemukan`);
  }

  // If pending, verify live status from DOKU or Midtrans!
  if (invoice.status === "pending") {
    let check = await checkDokuTransactionStatus(invoiceNumber);
    let resolvedProvider = "doku";
    if (check.status !== "settled") {
      check = await checkMidtransTransactionStatus(invoiceNumber);
      resolvedProvider = "midtrans";
    }

    if (check.status === "settled") {
      const postCommit: { confirmationEmail?: { address: string; details: Parameters<typeof sendSubscriptionSuccessEmail>[1] } } = {};
      const activated = await db.transaction(async (tx) => {
        const updatedInvoices = await tx
          .update(subscriptionInvoices)
          .set({
            status: "paid",
            paidAt: new Date(),
            paymentReference: (check.raw as Record<string, unknown>)?.transaction_id ? String((check.raw as Record<string, unknown>).transaction_id) : invoiceNumber,
            paymentProvider: resolvedProvider,
            updatedAt: new Date(),
          })
          .where(and(eq(subscriptionInvoices.id, invoice.id), eq(subscriptionInvoices.status, "pending")))
          .returning({ id: subscriptionInvoices.id });
        if (updatedInvoices.length === 0) return false;

        const meta = (invoice.metadata || {}) as { plan?: PlanTier; billingCycle?: "monthly" | "yearly" };
        const plan = meta.plan || "pro";
        const billingCycle = meta.billingCycle || "monthly";

        const updatedSub = await upgradeSubscription(invoice.organizationId, {
          plan,
          billingCycle,
          paymentProvider: resolvedProvider,
          externalSubscriptionId: (check.raw as Record<string, unknown>)?.transaction_id ? String((check.raw as Record<string, unknown>).transaction_id) : invoiceNumber,
        }, tx as unknown as typeof db);

        const [ownerMember] = await tx
          .select({ name: user.name, email: user.email })
          .from(tenantMembers)
          .innerJoin(user, eq(user.id, tenantMembers.userId))
          .where(and(eq(tenantMembers.organizationId, invoice.organizationId), eq(tenantMembers.role, "owner")))
          .limit(1);

        const [org] = await tx
          .select({ name: organizations.name, email: organizations.email })
          .from(organizations)
          .where(eq(organizations.id, invoice.organizationId))
          .limit(1);

        const targetEmail = ownerMember?.email || org?.email;
        if (targetEmail) {
          const planConfig = PLANS[plan] || PLANS.pro;
          postCommit.confirmationEmail = { address: targetEmail, details: {
            userName: ownerMember?.name || "Owner",
            businessName: org?.name || "Kedai-Ku",
            planName: planConfig.name,
            invoiceNumber,
            amount: Number(invoice.amount),
            billingCycle,
            periodEnd: updatedSub.currentPeriodEnd || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          } };
        }
        return true;
      });
      if (postCommit.confirmationEmail) {
        void sendSubscriptionSuccessEmail(postCommit.confirmationEmail.address, postCommit.confirmationEmail.details);
      }
      if (activated) invoice.status = "paid";
      else {
        const [current] = await db.select({ status: subscriptionInvoices.status })
          .from(subscriptionInvoices).where(eq(subscriptionInvoices.id, invoice.id)).limit(1);
        if (current) invoice.status = current.status;
      }
    }
  }

  return dataResponse({
    invoice,
    isPaid: invoice.status === "paid",
  });
});
