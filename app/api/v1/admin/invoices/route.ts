import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, subscriptionInvoices } from "@/db/schema";
import { apiHandler, dataResponse } from "@/lib/api";
import { AppError, requireSession } from "@/lib/server";
import { isSuperAdminUser } from "@/lib/super-admin";

export const GET = apiHandler(async (request) => {
  const session = await requireSession(request.headers);
  if (!isSuperAdminUser(session.user)) {
    throw new AppError("FORBIDDEN", "Akses ditolak: Hanya Master Admin platform yang dapat melihat riwayat tagihan platform");
  }

  const invoices = await db
    .select({
      id: subscriptionInvoices.id,
      invoiceNumber: subscriptionInvoices.invoiceNumber,
      amount: subscriptionInvoices.amount,
      status: subscriptionInvoices.status,
      paymentProvider: subscriptionInvoices.paymentProvider,
      paidAt: subscriptionInvoices.paidAt,
      dueAt: subscriptionInvoices.dueAt,
      metadata: subscriptionInvoices.metadata,
      createdAt: subscriptionInvoices.createdAt,
      organizationId: subscriptionInvoices.organizationId,
      organizationName: organizations.name,
      organizationEmail: organizations.email,
    })
    .from(subscriptionInvoices)
    .leftJoin(organizations, eq(subscriptionInvoices.organizationId, organizations.id))
    .orderBy(desc(subscriptionInvoices.createdAt))
    .limit(100);

  return dataResponse({
    invoices,
    total: invoices.length,
  });
});
