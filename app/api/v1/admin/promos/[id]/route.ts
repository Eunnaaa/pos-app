import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { promoCodes } from "@/db/schema";
import { apiHandler, dataResponse } from "@/lib/api";
import { AppError, parseJson, requireSession } from "@/lib/server";
import { isSuperAdminUser } from "@/lib/super-admin";

const updatePromoSchema = z.object({
  discountValue: z.number().int().min(1).optional(),
  maxUses: z.number().int().min(1).optional(),
  isActive: z.boolean().optional(),
  expiresAt: z.string().nullable().optional(),
});

export const PATCH = apiHandler(async (request) => {
  const session = await requireSession(request.headers);
  if (!isSuperAdminUser(session.user)) {
    throw new AppError("FORBIDDEN", "Akses ditolak: Hanya Super Admin");
  }

  const id = new URL(request.url).pathname.split("/").filter(Boolean).at(-1)!;
  const input = await parseJson(request, updatePromoSchema);

  const [updated] = await db
    .update(promoCodes)
    .set({
      ...input,
      expiresAt: input.expiresAt === undefined ? undefined : (input.expiresAt ? new Date(input.expiresAt) : null),
      updatedAt: new Date(),
    })
    .where(eq(promoCodes.id, id))
    .returning();

  return dataResponse(updated);
});

export const DELETE = apiHandler(async (request) => {
  const session = await requireSession(request.headers);
  if (!isSuperAdminUser(session.user)) {
    throw new AppError("FORBIDDEN", "Akses ditolak: Hanya Super Admin");
  }

  const id = new URL(request.url).pathname.split("/").filter(Boolean).at(-1)!;
  await db.delete(promoCodes).where(eq(promoCodes.id, id));

  return dataResponse({ success: true });
});
