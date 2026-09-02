import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { uploadToSupabaseStorage } from "@/lib/integrations/storage";
import { AppError, validateImageBytes } from "@/lib/server";

const MAX_BYTES = 2 * 1024 * 1024;
const allowedTypes = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"] as const;

export const POST = apiHandler(async (request) => {
  const context = await requireApiContext(request, "settings:manage");
  if (context.tenant.role !== "owner") throw new AppError("FORBIDDEN", "Hanya owner yang dapat mengubah logo organisasi");
  const contentType = request.headers.get("content-type")?.split(";", 1)[0] ?? "";
  if (!allowedTypes.includes(contentType as (typeof allowedTypes)[number])) {
    throw new AppError("BAD_REQUEST", "Format logo tidak didukung. Gunakan PNG, JPG, WEBP, GIF, atau AVIF");
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  const buffer = await request.arrayBuffer();
  if (length > MAX_BYTES || buffer.byteLength > MAX_BYTES) {
    throw new AppError("BAD_REQUEST", "Logo maksimal 2MB");
  }

  const validated = validateImageBytes(buffer, contentType, allowedTypes);
  const extension = validated.extension;
  const objectPath = `orgs/${context.organizationId}/logo-${Date.now()}.${extension}`;
  const { publicUrl } = await uploadToSupabaseStorage("logos", objectPath, buffer, validated.contentType);

  const [updated] = await db
    .update(organizations)
    .set({ logoUrl: publicUrl, updatedAt: new Date() })
    .where(eq(organizations.id, context.organizationId))
    .returning({ logoUrl: organizations.logoUrl });

  return dataResponse({ logoUrl: updated?.logoUrl ?? publicUrl });
});
