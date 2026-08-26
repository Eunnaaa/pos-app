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
import { checkMidtransTransactionStatus } from "@/lib/integrations/payments";
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

  // If pending, verify live Midtrans status!
  if (invoice.status === "pending") {
    const check = await checkMidtransTransactionStatus(invoiceNumber);
    if (check.status === "settled") {
      await db.transaction(async (tx) => {
        await tx
          .update(subscriptionInvoices)
          .set({
            status: "paid",
            paidAt: new Date(),
            paymentReference: (check.raw as Record<string, unknown>)?.transaction_id ? String((check.raw as Record<string, unknown>).transaction_id) : invoiceNumber,
            paymentProvider: "midtrans",
            updatedAt: new Date(),
          })
          .where(eq(subscriptionInvoices.id, invoice.id));

        const meta = (invoice.metadata || {}) as { plan?: PlanTier; billingCycle?: "monthly" | "yearly" };
        const plan = meta.plan || "pro";
        const billingCycle = meta.billingCycle || "monthly";

        const updatedSub = await upgradeSubscription(invoice.organizationId, {
          plan,
          billingCycle,
          paymentProvider: "midtrans",
          externalSubscriptionId: (check.raw as Record<string, unknown>)?.transaction_id ? String((check.raw as Record<string, unknown>).transaction_id) : invoiceNumber,
        });

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
          void sendSubscriptionSuccessEmail(targetEmail, {
            userName: ownerMember?.name || "Owner",
            businessName: org?.name || "Kedai-Ku",
            planName: planConfig.name,
            invoiceNumber,
            amount: Number(invoice.amount),
            billingCycle,
            periodEnd: updatedSub.currentPeriodEnd || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          });
        }
      });

      invoice.status = "paid";
    }
  }

  return dataResponse({
    invoice,
    isPaid: invoice.status === "paid",
  });
});
