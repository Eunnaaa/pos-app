import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { promoCodes } from "@/db/schema";
import { apiHandler, dataResponse } from "@/lib/api";
import { AppError, parseJson, requireSession } from "@/lib/server";
import { isSuperAdminEmail } from "@/lib/super-admin";

const createPromoSchema = z.object({
  code: z.string().min(3).max(30).transform((c) => c.toUpperCase().trim()),
  discountType: z.enum(["percentage", "fixed"]).default("percentage"),
  discountValue: z.number().int().min(1),
  applicablePlan: z.enum(["all", "pro", "business"]).default("all"),
  maxUses: z.number().int().min(1).default(100),
  isActive: z.boolean().default(true),
  expiresAt: z.string().optional(),
});

export const GET = apiHandler(async (request) => {
  const session = await requireSession(request.headers);
  if (!isSuperAdminEmail(session.user.email)) {
    throw new AppError("FORBIDDEN", "Akses ditolak: Hanya Super Admin");
  }

  const list = await db
    .select()
    .from(promoCodes)
    .orderBy(desc(promoCodes.createdAt));

  return dataResponse({ promos: list });
});

export const POST = apiHandler(async (request) => {
  const session = await requireSession(request.headers);
  if (!isSuperAdminEmail(session.user.email)) {
    throw new AppError("FORBIDDEN", "Akses ditolak: Hanya Super Admin");
  }

  const input = await parseJson(request, createPromoSchema);

  // Check if code exists
  const [existing] = await db
    .select()
    .from(promoCodes)
    .where(eq(promoCodes.code, input.code))
    .limit(1);

  if (existing) {
    throw new AppError("CONFLICT", "Kode promo ini sudah ada. Gunakan kode lain.");
  }

  const [created] = await db
    .insert(promoCodes)
    .values({
      code: input.code,
      discountType: input.discountType,
      discountValue: input.discountValue,
      applicablePlan: input.applicablePlan,
      maxUses: input.maxUses,
      isActive: input.isActive,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    })
    .returning();

  return dataResponse(created, { status: 201 });
});
