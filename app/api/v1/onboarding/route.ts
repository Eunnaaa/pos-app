import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { branches, cashRegisters, categories, organizations, tenantMembers, user, warehouses } from "@/db/schema";
import { apiHandler, dataResponse } from "@/lib/api";
import { parseJson, requireSession } from "@/lib/server";
import { DEFAULT_CATEGORIES } from "@/lib/services/categories";

const schema = z.object({
  businessName: z.string().min(2).max(150),
  slug: z.string().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  branchName: z.string().min(2).max(150).default("Cabang Utama"),
});

export const POST = apiHandler(async (request) => {
  const session = await requireSession(request.headers);
  const input = await parseJson(request, schema);
  const result = await db.transaction(async (tx) => {
    const [organization] = await tx.insert(organizations).values({ name: input.businessName, slug: input.slug }).returning();
    const [branch] = await tx.insert(branches).values({ organizationId: organization.id, code: "MAIN", name: input.branchName }).returning();
    const [warehouse] = await tx.insert(warehouses).values({ organizationId: organization.id, branchId: branch.id, code: "MAIN", name: "Gudang Utama", isDefault: true }).returning();
    await tx.insert(cashRegisters).values({ organizationId: organization.id, branchId: branch.id, code: "MAIN", name: "Kasir Utama" });
    await tx.insert(tenantMembers).values({ organizationId: organization.id, userId: session.user.id, role: "owner" });
    await tx.update(user).set({ activeOrganizationId: organization.id, updatedAt: new Date() }).where(eq(user.id, session.user.id));
    if (DEFAULT_CATEGORIES.length) {
      await tx.insert(categories).values(
        DEFAULT_CATEGORIES.map((c) => ({
          organizationId: organization.id,
          name: c.name,
          slug: c.slug,
          sortOrder: c.sortOrder,
          isActive: true,
        }))
      );
    }
    return { organization, branch, warehouse };
  });
  return dataResponse(result, { status: 201 });
});
