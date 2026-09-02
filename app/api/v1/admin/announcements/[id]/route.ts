import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { platformAnnouncements } from "@/db/schema";
import { apiHandler, dataResponse } from "@/lib/api";
import { AppError, parseJson, requireSession } from "@/lib/server";
import { isSuperAdminUser } from "@/lib/super-admin";

const updateAnnouncementSchema = z.object({
  title: z.string().min(3).optional(),
  message: z.string().min(5).optional(),
  type: z.enum(["info", "warning", "success", "promo"]).optional(),
  targetPlan: z.enum(["all", "free", "pro", "business"]).optional(),
  isActive: z.boolean().optional(),
});

export const PATCH = apiHandler(async (request) => {
  const session = await requireSession(request.headers);
  if (!isSuperAdminUser(session.user)) {
    throw new AppError("FORBIDDEN", "Akses ditolak: Hanya Super Admin");
  }

  const id = new URL(request.url).pathname.split("/").filter(Boolean).at(-1)!;
  const input = await parseJson(request, updateAnnouncementSchema);

  const [updated] = await db
    .update(platformAnnouncements)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(eq(platformAnnouncements.id, id))
    .returning();

  return dataResponse(updated);
});

export const DELETE = apiHandler(async (request) => {
  const session = await requireSession(request.headers);
  if (!isSuperAdminUser(session.user)) {
    throw new AppError("FORBIDDEN", "Akses ditolak: Hanya Super Admin");
  }

  const id = new URL(request.url).pathname.split("/").filter(Boolean).at(-1)!;
  await db.delete(platformAnnouncements).where(eq(platformAnnouncements.id, id));

  return dataResponse({ success: true });
});
