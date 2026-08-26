import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { platformAnnouncements } from "@/db/schema";
import { apiHandler, dataResponse } from "@/lib/api";

export const GET = apiHandler(async () => {
  const activeList = await db
    .select({
      id: platformAnnouncements.id,
      title: platformAnnouncements.title,
      message: platformAnnouncements.message,
      type: platformAnnouncements.type,
      targetPlan: platformAnnouncements.targetPlan,
      createdAt: platformAnnouncements.createdAt,
    })
    .from(platformAnnouncements)
    .where(eq(platformAnnouncements.isActive, true))
    .orderBy(desc(platformAnnouncements.createdAt))
    .limit(5);

  return dataResponse({ announcements: activeList });
});
