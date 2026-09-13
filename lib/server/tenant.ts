import { and, eq } from "drizzle-orm";
import { db, type Database } from "@/db";
import { branches, memberBranches, organizations, tenantMembers, user, type TenantRole } from "@/db/schema";
import { AppError } from "./errors";
import { type Permission, requirePermission } from "./rbac";
import { isSuperAdminUser } from "@/lib/super-admin";
import { assertBranchAccess } from "./branch-access";

export { assertBranchAccess } from "./branch-access";

export type TenantContext = {
  organizationId: string;
  memberId: string;
  role: TenantRole;
  permissions: string[];
  branchIds: string[];
  allBranches: boolean;
  activeBranchIds: string[];
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

  const [organization] = await database
    .select({ id: organizations.id })
    .from(organizations)
    .where(and(eq(organizations.id, organizationId), eq(organizations.isActive, true)))
    .limit(1);
  if (!organization) throw new AppError("FORBIDDEN", "Organization is inactive or not found");

  if (!member) {
    const userRow = await database.query.user.findFirst({
      where: eq(user.id, userId),
    });
    if (isSuperAdminUser(userRow)) {
      return {
        organizationId,
        memberId: `super-admin-${userId}`,
        role: "owner",
        permissions: ["all"],
        branchIds: [],
        allBranches: true,
        activeBranchIds: [],
      };
    }
    throw new AppError("FORBIDDEN", "No active membership for this organization");
  }

  const activeBranchRows = await database
    .select({ branchId: branches.id })
    .from(branches)
    .where(and(eq(branches.organizationId, organizationId), eq(branches.isActive, true)));
  const branchRows = await database
    .select({ branchId: memberBranches.branchId })
    .from(memberBranches)
    .innerJoin(branches, and(eq(branches.id, memberBranches.branchId), eq(branches.isActive, true), eq(branches.organizationId, organizationId)))
    .where(eq(memberBranches.tenantMemberId, member.id));

  return {
    organizationId,
    memberId: member.id,
    role: member.role,
    permissions: member.permissions,
    branchIds: branchRows.map(({ branchId }) => branchId),
    allBranches: member.role === "owner",
    activeBranchIds: activeBranchRows.map(({ branchId }) => branchId),
  };
}

export function authorizeTenant(context: TenantContext, permission: Permission, branchId?: string): void {
  requirePermission(context.role, permission, context.permissions);
  assertBranchAccess(context, branchId);
}
