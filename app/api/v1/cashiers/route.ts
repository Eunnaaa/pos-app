import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { branches, memberBranches, tenantMembers, user } from "@/db/schema";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { auth } from "@/lib/auth";
import { AppError, parseJson } from "@/lib/server";

const createSchema = z.object({
  name: z.string().trim().min(2).max(150),
  email: z.string().email().toLowerCase(),
  password: z.string().min(12).max(128),
  branchIds: z.array(z.string().uuid()).max(100).default([]),
});

export const GET = apiHandler(async (request) => {
  const context = await requireApiContext(request, "users:manage");
  if (context.tenant.role !== "owner") throw new AppError("FORBIDDEN", "Only owner can manage cashiers");
  const result = await db.execute(sql`
    select
      tm.id,
      u.id as user_id,
      u.name,
      u.email,
      tm.is_active,
      coalesce(
        (select json_agg(mb.branch_id) from member_branches mb where mb.tenant_member_id = tm.id),
        '[]'::json
      ) as branch_ids
    from tenant_members tm
    join "user" u on u.id = tm.user_id
    where tm.organization_id = ${context.organizationId} and tm.role = 'cashier'
    order by u.name
  `);
  return dataResponse(result.rows);
});

export const POST = apiHandler(async (request) => {
  const context = await requireApiContext(request, "users:manage");
  if (context.tenant.role !== "owner") throw new AppError("FORBIDDEN", "Only owner can create cashiers");
  const input = await parseJson(request, createSchema);
  if (input.branchIds.length > 0) {
    const validBranches = await db
      .select({ id: branches.id })
      .from(branches)
      .where(and(eq(branches.organizationId, context.organizationId), eq(branches.isActive, true), inArray(branches.id, input.branchIds)));
    if (validBranches.length !== input.branchIds.length) throw new AppError("VALIDATION_ERROR", "All branches must belong to organization");
  }
  const [existingUser] = await db.select({ id: user.id }).from(user).where(sql`lower(${user.email}) = ${input.email}`).limit(1);
  if (existingUser) throw new AppError("CONFLICT", "Email sudah terdaftar, gunakan email lain untuk kasir");

  let created: { user?: { id: string; name: string; email: string }; error?: { status?: number; message?: string } };
  try {
    created = (await auth.api.signUpEmail({
      body: { name: input.name, email: input.email, password: input.password },
    })) as { user?: { id: string; name: string; email: string }; error?: { status?: number; message?: string } };
  } catch (error) {
    console.error("cashiers signUpEmail threw", { email: input.email, error });
    throw new AppError("INTERNAL_ERROR", "Gagal membuat akun kasir", { cause: error });
  }
  if (created.error) throw new AppError(created.error.status === 409 ? "CONFLICT" : "BAD_REQUEST", created.error.message || "Gagal membuat akun kasir");
  const createdUser = created.user;
  if (!createdUser) throw new AppError("INTERNAL_ERROR", "Failed to create cashier user");
  try {
    const result = await db.transaction(async (tx) => {
      const [member] = await tx.insert(tenantMembers).values({ organizationId: context.organizationId, userId: createdUser.id, role: "cashier" }).returning();
      if (!member) throw new AppError("INTERNAL_ERROR", "Failed to create cashier membership");
      if (input.branchIds.length > 0) {
        await tx.insert(memberBranches).values(input.branchIds.map((branchId) => ({ tenantMemberId: member.id, branchId })));
      }
      return member;
    });
    return dataResponse({ memberId: result.id, userId: createdUser.id, name: createdUser.name, email: createdUser.email, role: result.role, branchIds: input.branchIds }, { status: 201 });
  } catch (error) {
    await db.delete(user).where(eq(user.id, createdUser.id)).catch(() => undefined);
    throw error;
  }
});
