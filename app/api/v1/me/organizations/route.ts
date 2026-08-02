import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { branches, organizations, tenantMembers, warehouses } from "@/db/schema";
import { apiHandler, dataResponse } from "@/lib/api";
import { requireSession } from "@/lib/server";

export const GET = apiHandler(async (request) => {
  const session = await requireSession(request.headers);
  const memberships = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      role: tenantMembers.role,
    })
    .from(tenantMembers)
    .innerJoin(organizations, eq(organizations.id, tenantMembers.organizationId))
    .where(and(eq(tenantMembers.userId, session.user.id), eq(tenantMembers.isActive, true), eq(organizations.isActive, true)));

  const data = await Promise.all(memberships.map(async (membership) => {
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
      .where(and(eq(branches.organizationId, membership.id), eq(branches.isActive, true)));

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
    return { ...membership, branches: Array.from(branchMap.values()) };
  }));

  return dataResponse(data);
});
