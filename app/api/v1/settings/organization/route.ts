import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { AppError, parseJson } from "@/lib/server";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  legalName: z.string().trim().max(200).optional().nullable(),
  taxId: z.string().trim().max(50).optional().nullable(),
  defaultCurrency: z.string().trim().max(10).optional(),
  timezone: z.string().trim().max(100).optional(),
  locale: z.string().trim().max(20).optional(),
});

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
    defaultCurrency: org.defaultCurrency,
    timezone: org.timezone,
    locale: org.locale,
  });
});

export const PATCH = apiHandler(async (request) => {
  const context = await requireApiContext(request, "settings:manage");
  if (context.tenant.role !== "owner") throw new AppError("FORBIDDEN", "Hanya owner yang dapat mengubah profil organisasi");
  const input = await parseJson(request, updateSchema);

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.legalName !== undefined) updates.legalName = input.legalName;
  if (input.taxId !== undefined) updates.taxId = input.taxId;
  if (input.defaultCurrency !== undefined) updates.defaultCurrency = input.defaultCurrency;
  if (input.timezone !== undefined) updates.timezone = input.timezone;
  if (input.locale !== undefined) updates.locale = input.locale;

  const [updated] = await db.update(organizations).set(updates).where(eq(organizations.id, context.organizationId)).returning();
  if (!updated) throw new AppError("NOT_FOUND", "Organization not found");
  return dataResponse({
    id: updated.id,
    name: updated.name,
    slug: updated.slug,
    legalName: updated.legalName,
    taxId: updated.taxId,
    defaultCurrency: updated.defaultCurrency,
    timezone: updated.timezone,
    locale: updated.locale,
  });
});
