import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { branches, memberBranches, organizations, tenantMembers, warehouses } from "@/db/schema";
import { apiHandler, dataResponse } from "@/lib/api";
import { requireSession } from "@/lib/server";
import { isSuperAdminUser } from "@/lib/super-admin";

export const GET = apiHandler(async (request) => {
  const session = await requireSession(request.headers);
  const isSuperAdmin = isSuperAdminUser(session.user);
  const memberships = await db
    .select({
       id: organizations.id,
       memberId: tenantMembers.id,
       name: organizations.name,
      slug: organizations.slug,
      role: tenantMembers.role,
    })
    .from(tenantMembers)
    .innerJoin(organizations, eq(organizations.id, tenantMembers.organizationId))
    .where(and(eq(tenantMembers.userId, session.user.id), eq(tenantMembers.isActive, true), eq(organizations.isActive, true)));

  const data = await Promise.all(memberships.map(async (membership) => {
    const assignedBranches = membership.role === "cashier"
      ? await db.select({ branchId: memberBranches.branchId }).from(memberBranches).where(eq(memberBranches.tenantMemberId, membership.memberId))
      : [];
    const assignedBranchIds = assignedBranches.map(({ branchId }) => branchId);
    const branchRows = await db
      .select({
        id: branches.id,
        name: branches.name,
        code: branches.code,
        warehouseId: warehouses.id,
        warehouseName: warehouses.name,
        warehouseIsDefault: warehouses.isDefault,
      })
      .from(branches)
      .leftJoin(warehouses, and(eq(warehouses.branchId, branches.id), eq(warehouses.isActive, true)))
      .where(and(
        eq(branches.organizationId, membership.id),
        eq(branches.isActive, true),
        ...(assignedBranchIds.length ? [inArray(branches.id, assignedBranchIds)] : []),
      ));

    const branchMap = new Map<string, {
      id: string;
      name: string;
      code: string;
      warehouses: { id: string; name: string; isDefault: boolean }[];
    }>();
    for (const row of branchRows) {
      const branch = branchMap.get(row.id) ?? { id: row.id, name: row.name, code: row.code, warehouses: [] };
      if (row.warehouseId && row.warehouseName) {
        branch.warehouses.push({ id: row.warehouseId, name: row.warehouseName, isDefault: row.warehouseIsDefault ?? false });
      }
      branchMap.set(row.id, branch);
    }
    return {
      ...membership,
      canAccessAllBranches: membership.role === "owner" || assignedBranchIds.length === 0,
      branches: Array.from(branchMap.values()),
    };
  }));

  return dataResponse(data, {}, { isSuperAdmin });
});
