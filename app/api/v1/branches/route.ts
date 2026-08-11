import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { branches, cashRegisters, warehouses } from "@/db/schema";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { AppError, parseJson } from "@/lib/server";

const createSchema = z.object({
  name: z.string().trim().min(2).max(150),
  code: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9_-]+$/),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().max(150).optional(),
  address: z.string().trim().max(500).optional(),
  city: z.string().trim().max(150).optional(),
  province: z.string().trim().max(150).optional(),
  postalCode: z.string().trim().max(20).optional(),
  timezone: z.string().trim().max(100).optional(),
});

export const POST = apiHandler(async (request) => {
  const context = await requireApiContext(request, "branches:manage");
  if (context.tenant.role !== "owner") throw new AppError("FORBIDDEN", "Only owner can manage branches");
  const input = await parseJson(request, createSchema);

  const result = await db.transaction(async (tx) => {
    const [existing] = (await tx.execute<{ code: string }>(sql`select code from branches where organization_id = ${context.organizationId} and lower(code) = lower(${input.code}) limit 1`)).rows;
    if (existing) throw new AppError("CONFLICT", `Kode cabang "${input.code}" sudah dipakai`, { details: { code: input.code } });

    const [branch] = await tx.insert(branches).values({
      organizationId: context.organizationId,
      code: input.code.toUpperCase(),
      name: input.name,
      phone: input.phone,
      email: input.email,
      address: input.address,
      city: input.city,
      province: input.province,
      postalCode: input.postalCode,
      timezone: input.timezone,
    }).returning();

    const [warehouse] = await tx.insert(warehouses).values({
      organizationId: context.organizationId,
      branchId: branch.id,
      code: `${input.code.toUpperCase()}-GDG`,
      name: `Gudang ${input.name}`,
      address: input.address,
      isDefault: true,
    }).returning();

    const [register] = await tx.insert(cashRegisters).values({
      organizationId: context.organizationId,
      branchId: branch.id,
      code: input.code.toUpperCase(),
      name: "Kasir Utama",
    }).returning();

    return { branch, warehouse, register };
  });

  return dataResponse(result, { status: 201 });
});