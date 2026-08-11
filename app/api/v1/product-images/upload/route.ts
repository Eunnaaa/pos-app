import { z } from "zod";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { uploadToSupabaseStorage } from "@/lib/integrations";
import { uploadProductImage } from "@/lib/services/product-images";
import { AppError } from "@/lib/server";

const ALLOWED_MIME = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);

export const POST = apiHandler(async (request) => {
  const context = await requireApiContext(request, "sales:write");
  const form = await request.formData();
  const productId = z.string().uuid().parse(form.get("productId"));
  const altText = typeof form.get("altText") === "string" && form.get("altText") ? String(form.get("altText")) : undefined;
  const file = form.get("file");
  if (!(file instanceof File)) throw new AppError("VALIDATION_ERROR", "File gambar wajib dikirim");
  const extension = ALLOWED_MIME.get(file.type);
  if (!extension) throw new AppError("VALIDATION_ERROR", "Format gambar harus PNG, JPG, atau WebP");
  if (file.size > 5 * 1024 * 1024) throw new AppError("VALIDATION_ERROR", "Ukuran gambar maksimal 5 MB");

  const path = `${context.organizationId}/${productId}/${crypto.randomUUID()}.${extension}`;
  const uploaded = await uploadToSupabaseStorage("product-images", path, file, file.type);

  const result = await uploadProductImage(context.organizationId, productId, uploaded.publicUrl, altText);
  return dataResponse({ ...result, storagePath: uploaded.path }, { status: 201 });
});