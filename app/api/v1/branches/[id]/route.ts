import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { branches } from "@/db/schema";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { AppError, parseJson } from "@/lib/server";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().max(150).optional(),
  address: z.string().trim().max(500).optional(),
  city: z.string().trim().max(150).optional(),
  province: z.string().trim().max(150).optional(),
  postalCode: z.string().trim().max(20).optional(),
  timezone: z.string().trim().max(100).optional(),
  isActive: z.boolean().optional(),
});

export const PATCH = apiHandler(async (request) => {
  const context = await requireApiContext(request, "branches:manage");
  if (context.tenant.role !== "owner") throw new AppError("FORBIDDEN", "Only owner can manage branches");
  const id = z.string().uuid().parse(new URL(request.url).pathname.split("/").filter(Boolean).at(-1));
  const input = await parseJson(request, updateSchema);

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.phone !== undefined) updates.phone = input.phone;
  if (input.email !== undefined) updates.email = input.email;
  if (input.address !== undefined) updates.address = input.address;
  if (input.city !== undefined) updates.city = input.city;
  if (input.province !== undefined) updates.province = input.province;
  if (input.postalCode !== undefined) updates.postalCode = input.postalCode;
  if (input.timezone !== undefined) updates.timezone = input.timezone;
  if (input.isActive !== undefined) updates.isActive = input.isActive;

  const [updated] = await db
    .update(branches)
    .set(updates)
    .where(and(eq(branches.id, id), eq(branches.organizationId, context.organizationId)))
    .returning();

  if (!updated) throw new AppError("NOT_FOUND", "Branch not found");
  return dataResponse(updated);
});

export const DELETE = apiHandler(async (request) => {
  const context = await requireApiContext(request, "branches:manage");
  if (context.tenant.role !== "owner") throw new AppError("FORBIDDEN", "Only owner can manage branches");
  const id = z.string().uuid().parse(new URL(request.url).pathname.split("/").filter(Boolean).at(-1));

  const [updated] = await db
    .update(branches)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(branches.id, id), eq(branches.organizationId, context.organizationId), eq(branches.isActive, true)))
    .returning({ id: branches.id });

  if (!updated) throw new AppError("NOT_FOUND", "Branch not found or already inactive");
  return new Response(null, { status: 204 });
});
