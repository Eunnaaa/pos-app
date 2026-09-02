import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { branches, type JsonValue } from "@/db/schema";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { assertSafeQrisDataUrl, decodeQrisFromDataUrl } from "@/lib/qris-server";
import { AppError, encryptSecret, isEncryptedSecret, parseJson } from "@/lib/server";

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
  qrisImageUrl: z.string().trim().max(2000000).nullable().optional(),
  qrisAccountName: z.string().trim().max(100).nullable().optional(),
  qrisInstructions: z.string().trim().max(500).nullable().optional(),
  midtransServerKey: z.string().trim().max(200).nullable().optional(),
  midtransClientKey: z.string().trim().max(200).nullable().optional(),
  midtransMerchantId: z.string().trim().max(100).nullable().optional(),
  paymentMode: z.enum(["inherit", "branch_midtrans", "manual_qris"]).optional(),
});

export const PATCH = apiHandler(async (request) => {
  const context = await requireApiContext(request, "branches:manage");
  if (context.tenant.role !== "owner") throw new AppError("FORBIDDEN", "Only owner can manage branches");
  const id = z.string().uuid().parse(new URL(request.url).pathname.split("/").filter(Boolean).at(-1));
  const input = await parseJson(request, updateSchema);

  const [existingBranch] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.id, id), eq(branches.organizationId, context.organizationId)))
    .limit(1);
  if (!existingBranch) throw new AppError("NOT_FOUND", "Branch not found");

  const currentMeta = (existingBranch.metadata || {}) as Record<string, JsonValue>;
  const storedServerKey = typeof currentMeta.midtransServerKey === "string" && currentMeta.midtransServerKey
    ? (isEncryptedSecret(currentMeta.midtransServerKey) ? currentMeta.midtransServerKey : encryptSecret(currentMeta.midtransServerKey))
    : currentMeta.midtransServerKey;
  const storedClientKey = typeof currentMeta.midtransClientKey === "string" && currentMeta.midtransClientKey
    ? (isEncryptedSecret(currentMeta.midtransClientKey) ? currentMeta.midtransClientKey : encryptSecret(currentMeta.midtransClientKey))
    : currentMeta.midtransClientKey;
  const updatedMeta: Record<string, JsonValue> = {
    ...currentMeta,
    ...(storedServerKey !== undefined ? { midtransServerKey: storedServerKey } : {}),
    ...(storedClientKey !== undefined ? { midtransClientKey: storedClientKey } : {}),
    ...(input.qrisImageUrl !== undefined ? { qrisImageUrl: input.qrisImageUrl } : {}),
    ...(input.qrisAccountName !== undefined ? { qrisAccountName: input.qrisAccountName } : {}),
    ...(input.qrisInstructions !== undefined ? { qrisInstructions: input.qrisInstructions } : {}),
    ...(input.midtransServerKey !== undefined ? { midtransServerKey: input.midtransServerKey ? encryptSecret(input.midtransServerKey) : null } : {}),
    ...(input.midtransClientKey !== undefined ? { midtransClientKey: input.midtransClientKey ? encryptSecret(input.midtransClientKey) : null } : {}),
    ...(input.midtransMerchantId !== undefined ? { midtransMerchantId: input.midtransMerchantId } : {}),
    ...(input.paymentMode !== undefined ? { paymentMode: input.paymentMode } : {}),
  };

  if (input.qrisImageUrl) {
    assertSafeQrisDataUrl(input.qrisImageUrl);
    const decoded = decodeQrisFromDataUrl(input.qrisImageUrl);
    if (decoded) updatedMeta.qrisPayload = decoded;
  } else if (input.qrisImageUrl === null) {
    delete updatedMeta.qrisPayload;
  }

  const updates: Record<string, unknown> = {
    updatedAt: new Date(),
    metadata: updatedMeta,
  };
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
  const newMeta = (updated.metadata || {}) as Record<string, unknown>;
  const safeMeta = { ...newMeta };
  delete safeMeta.midtransServerKey;
  delete safeMeta.midtransClientKey;
  return dataResponse({
    ...updated,
    metadata: safeMeta,
    qrisImageUrl: typeof newMeta.qrisImageUrl === "string" ? newMeta.qrisImageUrl : null,
    qrisAccountName: typeof newMeta.qrisAccountName === "string" ? newMeta.qrisAccountName : null,
    qrisInstructions: typeof newMeta.qrisInstructions === "string" ? newMeta.qrisInstructions : null,
  });
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
