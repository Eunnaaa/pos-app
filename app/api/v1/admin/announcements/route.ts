import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { platformAnnouncements } from "@/db/schema";
import { apiHandler, dataResponse } from "@/lib/api";
import { AppError, parseJson, requireSession } from "@/lib/server";
import { isSuperAdminEmail } from "@/lib/super-admin";

const createAnnouncementSchema = z.object({
  title: z.string().min(3),
  message: z.string().min(5),
  type: z.enum(["info", "warning", "success", "promo"]).default("info"),
  targetPlan: z.enum(["all", "free", "pro", "business"]).default("all"),
  isActive: z.boolean().default(true),
});

export const GET = apiHandler(async (request) => {
  const session = await requireSession(request.headers);
  if (!isSuperAdminEmail(session.user.email)) {
    throw new AppError("FORBIDDEN", "Akses ditolak: Hanya Super Admin");
  }

  const list = await db
    .select()
    .from(platformAnnouncements)
    .orderBy(desc(platformAnnouncements.createdAt));

  return dataResponse({ announcements: list });
});

export const POST = apiHandler(async (request) => {
  const session = await requireSession(request.headers);
  if (!isSuperAdminEmail(session.user.email)) {
    throw new AppError("FORBIDDEN", "Akses ditolak: Hanya Super Admin");
  }

  const input = await parseJson(request, createAnnouncementSchema);
  const [created] = await db
    .insert(platformAnnouncements)
    .values({
      title: input.title,
      message: input.message,
      type: input.type,
      targetPlan: input.targetPlan,
      isActive: input.isActive,
      createdBy: session.user.email,
    })
    .returning();

  return dataResponse(created, { status: 201 });
});
