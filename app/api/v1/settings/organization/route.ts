import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { AppError, parseJson } from "@/lib/server";

const phoneSchema = z.string().trim().max(30).nullable().optional();
const emailSchema = z.string().trim().email().max(150).nullable().optional();
const addressSchema = z.string().trim().max(500).nullable().optional();
const urlSchema = z.string().trim().url().max(500).nullable().optional();
const slugSchema = z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const updateSchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  slug: slugSchema.optional(),
  legalName: z.string().trim().max(200).nullable().optional(),
  taxId: z.string().trim().max(50).nullable().optional(),
  phone: phoneSchema,
  email: emailSchema,
  address: addressSchema,
  logoUrl: urlSchema,
  description: z.string().trim().max(1000).nullable().optional(),
  defaultCurrency: z.string().trim().max(10).optional(),
  timezone: z.string().trim().max(100).optional(),
  locale: z.string().trim().max(20).optional(),
});

const updateKeys = ["name", "slug", "legalName", "taxId", "phone", "email", "address", "logoUrl", "description", "defaultCurrency", "timezone", "locale"] as const;

export const GET = apiHandler(async (request) => {
  const context = await requireApiContext(request, "settings:manage");
  const [org] = await db.select().from(organizations).where(eq(organizations.id, context.organizationId)).limit(1);
  if (!org) throw new AppError("NOT_FOUND", "Organization not found");
  return dataResponse({
    id: org.id,
    name: org.name,
    slug: org.slug,
    legalName: org.legalName,
    taxId: org.taxId,
    phone: org.phone,
    email: org.email,
    address: org.address,
    logoUrl: org.logoUrl,
    description: org.description,
    defaultCurrency: org.defaultCurrency,
    timezone: org.timezone,
    locale: org.locale,
  });
});

export const PATCH = apiHandler(async (request) => {
  const context = await requireApiContext(request, "settings:manage");
  if (context.tenant.role !== "owner") throw new AppError("FORBIDDEN", "Hanya owner yang dapat mengubah profil organisasi");
  const input = await parseJson(request, updateSchema);

  // Normalize slug to lowercase so conflict feedback is consistent with other unique keys.
  if (input.slug !== undefined) input.slug = input.slug.toLowerCase();

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of updateKeys) {
    if (input[key] !== undefined) updates[key] = input[key] === null ? null : input[key];
  }

  const [updated] = await db.update(organizations).set(updates).where(eq(organizations.id, context.organizationId)).returning();
  if (!updated) throw new AppError("NOT_FOUND", "Organization not found");
  return dataResponse({
    id: updated.id,
    name: updated.name,
    slug: updated.slug,
    legalName: updated.legalName,
    taxId: updated.taxId,
    phone: updated.phone,
    email: updated.email,
    address: updated.address,
    logoUrl: updated.logoUrl,
    description: updated.description,
    defaultCurrency: updated.defaultCurrency,
    timezone: updated.timezone,
    locale: updated.locale,
  });
});

export const DELETE = apiHandler(async (request) => {
  const context = await requireApiContext(request, "settings:manage");
  if (context.tenant.role !== "owner") throw new AppError("FORBIDDEN", "Hanya owner yang dapat menonaktifkan organisasi");

  const [updated] = await db
    .update(organizations)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(organizations.id, context.organizationId))
    .returning();

  if (!updated) throw new AppError("NOT_FOUND", "Organization not found");
  return new Response(null, { status: 204 });
});