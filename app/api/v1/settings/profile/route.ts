import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { organizationSettings } from "@/db/schema";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { AppError, parseJson } from "@/lib/server";

const PROFILE_NAMESPACE = "profile";
const phoneSchema = z.string().regex(/^\+?[0-9]{8,15}$/, "Format nomor tidak valid");

export const GET = apiHandler(async (request) => {
  const context = await requireApiContext(request, "settings:manage");
  const [setting] = await db
    .select({ value: organizationSettings.value })
    .from(organizationSettings)
    .where(and(eq(organizationSettings.organizationId, context.organizationId), eq(organizationSettings.namespace, PROFILE_NAMESPACE)))
    .limit(1);
  const value = (setting?.value ?? {}) as { phone?: string };
  return dataResponse({ phone: value.phone ?? null });
});

export const PUT = apiHandler(async (request) => {
  const context = await requireApiContext(request, "settings:manage");
  if (context.tenant.role !== "owner") throw new AppError("FORBIDDEN", "Hanya owner yang dapat mengubah profil");
  const input = await parseJson(request, z.object({ phone: phoneSchema.nullable() }));
  const value = { phone: input.phone };
  await db
    .insert(organizationSettings)
    .values({ organizationId: context.organizationId, namespace: PROFILE_NAMESPACE, value })
    .onConflictDoUpdate({ target: [organizationSettings.organizationId, organizationSettings.namespace], set: { value, updatedAt: new Date() } });
  return dataResponse({ phone: input.phone });
});