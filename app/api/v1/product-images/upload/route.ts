import { z } from "zod";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { uploadToSupabaseStorage } from "@/lib/integrations";
import { uploadProductImage } from "@/lib/services/product-images";
import { AppError, validateImageBytes } from "@/lib/server";

const ALLOWED_MIME = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);

export const POST = apiHandler(async (request) => {
  const context = await requireApiContext(request, "inventory:write");
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > 6 * 1024 * 1024) {
    throw new AppError("VALIDATION_ERROR", "Upload payload is too large");
  }
  const form = await request.formData();
  const productId = z.string().uuid().parse(form.get("productId"));
  const altText = typeof form.get("altText") === "string" && form.get("altText")
    ? z.string().trim().max(300).parse(form.get("altText"))
    : undefined;
  const file = form.get("file");
  if (!(file instanceof File)) throw new AppError("VALIDATION_ERROR", "File gambar wajib dikirim");
  if (!ALLOWED_MIME.has(file.type)) throw new AppError("VALIDATION_ERROR", "Format gambar harus PNG, JPG, atau WebP");
  if (file.size > 5 * 1024 * 1024) throw new AppError("VALIDATION_ERROR", "Ukuran gambar maksimal 5 MB");
  const buffer = await file.arrayBuffer();
  const { contentType, extension } = validateImageBytes(buffer, file.type, ["image/png", "image/jpeg", "image/webp"]);

  const path = `${context.organizationId}/${productId}/${crypto.randomUUID()}.${extension}`;
  const uploaded = await uploadToSupabaseStorage("product-images", path, buffer, contentType);

  const result = await uploadProductImage(context.organizationId, productId, uploaded.publicUrl, altText);
  return dataResponse({ ...result, storagePath: uploaded.path }, { status: 201 });
});
