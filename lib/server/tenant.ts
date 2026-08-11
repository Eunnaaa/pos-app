import { and, eq } from "drizzle-orm";
import { db, type Database } from "@/db";
import { memberBranches, tenantMembers, type TenantRole } from "@/db/schema";
import { AppError } from "./errors";
import { type Permission, requirePermission } from "./rbac";

export type TenantContext = {
  organizationId: string;
  memberId: string;
  role: TenantRole;
  permissions: string[];
  branchIds: string[];
};

export async function resolveTenantContext(
  userId: string,
  organizationId: string,
  database: Database = db,
): Promise<TenantContext> {
  const member = await database.query.tenantMembers.findFirst({
    where: and(
      eq(tenantMembers.userId, userId),
      eq(tenantMembers.organizationId, organizationId),
      eq(tenantMembers.isActive, true),
    ),
  });
  if (!member) throw new AppError("FORBIDDEN", "No active membership for this organization");

  const branchRows = await database
    .select({ branchId: memberBranches.branchId })
    .from(memberBranches)
    .where(eq(memberBranches.tenantMemberId, member.id));

  return {
    organizationId,
    memberId: member.id,
    role: member.role,
    permissions: member.permissions,
    branchIds: branchRows.map(({ branchId }) => branchId),
  };
}

export function authorizeTenant(context: TenantContext, permission: Permission, branchId?: string): void {
  requirePermission(context.role, permission, context.permissions);
  void branchId;
}
