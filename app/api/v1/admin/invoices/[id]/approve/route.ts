import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, organizations, subscriptionInvoices, tenantMembers, user } from "@/db/schema";
import { apiHandler, dataResponse } from "@/lib/api";
import { sendSubscriptionSuccessEmail } from "@/lib/integrations/notifications";
import { AppError, requireSession } from "@/lib/server";
import { upgradeSubscription } from "@/lib/services/subscription";
import { isSuperAdminEmail } from "@/lib/super-admin";
import { PLANS, type PlanId } from "@/config/plans";

export const POST = apiHandler(async (request) => {
  const session = await requireSession(request.headers);
  if (!isSuperAdminEmail(session.user.email)) {
    throw new AppError("FORBIDDEN", "Akses ditolak: Hanya Super Admin");
  }

  const url = new URL(request.url);
  const segments = url.pathname.split("/").filter(Boolean);
  // /api/v1/admin/invoices/[id]/approve
  const invoiceId = segments[segments.length - 2];

  if (!invoiceId) {
    throw new AppError("BAD_REQUEST", "ID invoice diperlukan");
  }

  const [invoice] = await db
    .select()
    .from(subscriptionInvoices)
    .where(eq(subscriptionInvoices.id, invoiceId))
    .limit(1);

  if (!invoice) {
    throw new AppError("NOT_FOUND", "Invoice langganan tidak ditemukan");
  }

  if (invoice.status === "paid") {
    return dataResponse({
      message: "Invoice ini sudah dalam status lunas",
      invoice,
    });
  }

  const meta = (invoice.metadata || {}) as { plan?: PlanId; billingCycle?: "monthly" | "yearly" };
  const plan = (meta.plan || "pro") as PlanId;
  const billingCycle = meta.billingCycle || "monthly";

  // Mark invoice as paid
  const [updatedInvoice] = await db
    .update(subscriptionInvoices)
    .set({
      status: "paid",
      paidAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(subscriptionInvoices.id, invoice.id))
    .returning();

  // Upgrade tenant subscription
  const updatedSub = await upgradeSubscription(invoice.organizationId, {
    plan,
    billingCycle,
    paymentProvider: "manual_qris",
    externalSubscriptionId: invoice.invoiceNumber,
  });

  // Record audit log
  await db.insert(auditLogs).values({
    organizationId: invoice.organizationId,
    actorUserId: session.user.id,
    action: "subscription.invoice_approved",
    resourceType: "subscription_invoice",
    resourceId: invoice.id,
    metadata: {
      invoiceNumber: invoice.invoiceNumber,
      amount: invoice.amount,
      plan,
      billingCycle,
      approvedBy: session.user.email,
    },
  });

  // Send confirmation email
  const [org] = await db
    .select({ name: organizations.name, email: organizations.email })
    .from(organizations)
    .where(eq(organizations.id, invoice.organizationId))
    .limit(1);

  const [ownerMember] = await db
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
      invoiceNumber: invoice.invoiceNumber,
      amount: Number(invoice.amount),
      billingCycle,
      periodEnd: updatedSub.currentPeriodEnd || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
  }

  return dataResponse({
    success: true,
    message: `Pembayaran invoice ${invoice.invoiceNumber} berhasil disetujui! Paket ${plan.toUpperCase()} telah diaktifkan untuk merchant.`,
    invoice: updatedInvoice,
    subscription: updatedSub,
  });
});
