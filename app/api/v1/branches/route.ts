import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { branches, cashRegisters, warehouses, type JsonValue } from "@/db/schema";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { assertSafeQrisDataUrl, decodeQrisFromDataUrl } from "@/lib/qris-server";
import { AppError, encryptSecret, parseJson } from "@/lib/server";
import { assertCanCreateBranch } from "@/lib/services/subscription";

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
  qrisImageUrl: z.string().trim().max(2000000).nullable().optional(),
  qrisAccountName: z.string().trim().max(100).nullable().optional(),
  qrisInstructions: z.string().trim().max(500).nullable().optional(),
  midtransServerKey: z.string().trim().max(200).nullable().optional(),
  midtransClientKey: z.string().trim().max(200).nullable().optional(),
  midtransMerchantId: z.string().trim().max(100).nullable().optional(),
  paymentMode: z.enum(["inherit", "branch_midtrans", "manual_qris"]).optional(),
});

export const POST = apiHandler(async (request) => {
  const context = await requireApiContext(request, "branches:manage");
  if (context.tenant.role !== "owner") throw new AppError("FORBIDDEN", "Only owner can manage branches");
  await assertCanCreateBranch(context.organizationId);
  const input = await parseJson(request, createSchema);

  const result = await db.transaction(async (tx) => {
    const [existing] = (await tx.execute<{ code: string }>(sql`select code from branches where organization_id = ${context.organizationId} and lower(code) = lower(${input.code}) limit 1`)).rows;
    if (existing) throw new AppError("CONFLICT", `Kode cabang "${input.code}" sudah dipakai`, { details: { code: input.code } });

    const branchMeta: Record<string, JsonValue> = {};
    if (input.qrisImageUrl) {
      assertSafeQrisDataUrl(input.qrisImageUrl);
      branchMeta.qrisImageUrl = input.qrisImageUrl;
      const decoded = decodeQrisFromDataUrl(input.qrisImageUrl);
      if (decoded) branchMeta.qrisPayload = decoded;
    }
    if (input.qrisAccountName) branchMeta.qrisAccountName = input.qrisAccountName;
    if (input.qrisInstructions) branchMeta.qrisInstructions = input.qrisInstructions;
    if (input.midtransServerKey) branchMeta.midtransServerKey = encryptSecret(input.midtransServerKey);
    if (input.midtransClientKey) branchMeta.midtransClientKey = encryptSecret(input.midtransClientKey);
    if (input.midtransMerchantId) branchMeta.midtransMerchantId = input.midtransMerchantId;
    if (input.paymentMode) branchMeta.paymentMode = input.paymentMode;

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
      metadata: branchMeta,
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

  const safeMetadata = { ...((result.branch.metadata || {}) as Record<string, unknown>) };
  delete safeMetadata.midtransServerKey;
  delete safeMetadata.midtransClientKey;
  return dataResponse({
    ...result,
    branch: { ...result.branch, metadata: safeMetadata },
  }, { status: 201 });
});
