import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { organizations, subscriptions } from "@/db/schema";
import { apiHandler, dataResponse } from "@/lib/api";
import { AppError, parseJson, requireSession } from "@/lib/server";
import { upgradeSubscription } from "@/lib/services/subscription";
import { isSuperAdminEmail } from "@/lib/super-admin";

const updateTenantSchema = z.object({
  plan: z.enum(["free", "pro", "business"]).optional(),
  extendTrialDays: z.number().int().min(1).max(365).optional(),
  isActive: z.boolean().optional(),
});

export const PATCH = apiHandler(async (request) => {
  const session = await requireSession(request.headers);
  if (!isSuperAdminEmail(session.user.email)) {
    throw new AppError("FORBIDDEN", "Akses ditolak: Hanya Master Admin platform yang dapat mengubah data tenant");
  }

  const organizationId = new URL(request.url).pathname.split("/").filter(Boolean).at(-1)!;
  const input = await parseJson(request, updateTenantSchema);

  // Check if organization exists
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!org) {
    throw new AppError("NOT_FOUND", `Organisasi dengan ID ${organizationId} tidak ditemukan`);
  }

  // Toggle active status if provided
  if (input.isActive !== undefined) {
    await db
      .update(organizations)
      .set({ isActive: input.isActive, updatedAt: new Date() })
      .where(eq(organizations.id, organizationId));
  }

  // Manual upgrade plan if provided
  if (input.plan) {
    await upgradeSubscription(organizationId, {
      plan: input.plan,
      billingCycle: "monthly",
      paymentProvider: "super_admin_manual",
    });
  }

  // Extend trial if provided
  if (input.extendTrialDays) {
    const newTrialEnds = new Date();
    newTrialEnds.setDate(newTrialEnds.getDate() + input.extendTrialDays);

    await db
      .update(subscriptions)
      .set({
        trialEndsAt: newTrialEnds,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.organizationId, organizationId));
  }

  return dataResponse({
    success: true,
    message: `Berhasil memperbarui tenant ${org.name}`,
  });
});
