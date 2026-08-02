import type { Database } from "@/db";
import { db } from "@/db";
import { auditLogs, type JsonValue } from "@/db/schema";

export type AuditEvent = {
  organizationId?: string;
  branchId?: string;
  actorUserId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  before?: Record<string, JsonValue>;
  after?: Record<string, JsonValue>;
  metadata?: Record<string, JsonValue>;
};

export async function writeAuditLog(event: AuditEvent, database: Database = db): Promise<string> {
  const [record] = await database
    .insert(auditLogs)
    .values({
      ...event,
      metadata: event.metadata ?? {},
    })
    .returning({ id: auditLogs.id });
  return record.id;
}
