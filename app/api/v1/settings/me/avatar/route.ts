import { apiHandler, dataResponse } from "@/lib/api";
import { auth } from "@/lib/auth";
import { uploadToSupabaseStorage } from "@/lib/integrations/storage";
import { AppError, requireSession, validateImageBytes } from "@/lib/server";

const MAX_BYTES = 2 * 1024 * 1024;
const allowedTypes = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"] as const;

export const POST = apiHandler(async (request) => {
  const session = await requireSession(request.headers);

  const contentType = request.headers.get("content-type")?.split(";", 1)[0] ?? "";
  if (!allowedTypes.includes(contentType as (typeof allowedTypes)[number])) {
    throw new AppError("BAD_REQUEST", "Format gambar tidak didukung. Gunakan PNG, JPG, WEBP, GIF, atau AVIF");
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) {
    throw new AppError("BAD_REQUEST", "Gambar maksimal 2MB");
  }

  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > MAX_BYTES) {
    throw new AppError("BAD_REQUEST", "Gambar maksimal 2MB");
  }

  const validated = validateImageBytes(buffer, contentType, allowedTypes);
  const extension = validated.extension;
  const objectPath = `users/${session.user.id}/avatar-${Date.now()}.${extension}`;
  const { publicUrl } = await uploadToSupabaseStorage("avatars", objectPath, buffer, validated.contentType);

  await auth.api.updateUser({
    headers: request.headers,
    body: { image: publicUrl },
  });

  return dataResponse({ image: publicUrl });
});
