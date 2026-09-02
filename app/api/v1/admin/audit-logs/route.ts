import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, organizations, user } from "@/db/schema";
import { apiHandler, dataResponse } from "@/lib/api";
import { AppError, requireSession } from "@/lib/server";
import { isSuperAdminUser } from "@/lib/super-admin";

export const GET = apiHandler(async (request) => {
  const session = await requireSession(request.headers);
  if (!isSuperAdminUser(session.user)) {
    throw new AppError("FORBIDDEN", "Akses ditolak: Hanya Super Admin");
  }

  const logs = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      resourceType: auditLogs.resourceType,
      resourceId: auditLogs.resourceId,
      ipAddress: auditLogs.ipAddress,
      userAgent: auditLogs.userAgent,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
      organizationName: organizations.name,
      actorEmail: user.email,
      actorName: user.name,
    })
    .from(auditLogs)
    .leftJoin(organizations, eq(auditLogs.organizationId, organizations.id))
    .leftJoin(user, eq(auditLogs.actorUserId, user.id))
    .orderBy(desc(auditLogs.createdAt))
    .limit(50);

  return dataResponse({ logs });
});
