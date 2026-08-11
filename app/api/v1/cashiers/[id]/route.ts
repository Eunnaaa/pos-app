import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { memberBranches, tenantMembers, user } from "@/db/schema";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { AppError, parseJson } from "@/lib/server";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  branchIds: z.array(z.string().uuid()).max(100).optional(),
  isActive: z.boolean().optional(),
});

export const PATCH = apiHandler(async (request) => {
  const context = await requireApiContext(request, "users:manage");
  if (context.tenant.role !== "owner") throw new AppError("FORBIDDEN", "Only owner can manage cashiers");
  const id = z.string().uuid().parse(new URL(request.url).pathname.split("/").filter(Boolean).at(-1));
  const input = await parseJson(request, updateSchema);

  const [member] = await db.select({ id: tenantMembers.id, userId: tenantMembers.userId }).from(tenantMembers).where(and(eq(tenantMembers.id, id), eq(tenantMembers.organizationId, context.organizationId), eq(tenantMembers.role, "cashier"))).limit(1);
  if (!member) throw new AppError("NOT_FOUND", "Cashier not found");

  await db.transaction(async (tx) => {
    if (input.name !== undefined) {
      await tx.update(user).set({ name: input.name }).where(eq(user.id, member.userId));
    }
    if (input.isActive !== undefined) {
      await tx.update(tenantMembers).set({ isActive: input.isActive, updatedAt: new Date() }).where(eq(tenantMembers.id, member.id));
    }
    if (input.branchIds !== undefined) {
      await tx.delete(memberBranches).where(eq(memberBranches.tenantMemberId, member.id));
      if (input.branchIds.length > 0) {
        await tx.insert(memberBranches).values(input.branchIds.map((branchId) => ({ tenantMemberId: member.id, branchId })));
      }
    }
  });

  return dataResponse({ id, updated: input });
});

export const DELETE = apiHandler(async (request) => {
  const context = await requireApiContext(request, "users:manage");
  if (context.tenant.role !== "owner") throw new AppError("FORBIDDEN", "Only owner can manage cashiers");
  const id = z.string().uuid().parse(new URL(request.url).pathname.split("/").filter(Boolean).at(-1));

  const [member] = await db.select({ id: tenantMembers.id }).from(tenantMembers).where(and(eq(tenantMembers.id, id), eq(tenantMembers.organizationId, context.organizationId), eq(tenantMembers.role, "cashier"))).limit(1);
  if (!member) throw new AppError("NOT_FOUND", "Cashier not found");

  await db.update(tenantMembers).set({ isActive: false, updatedAt: new Date() }).where(eq(tenantMembers.id, member.id));
  return new Response(null, { status: 204 });
});
