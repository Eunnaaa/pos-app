import { apiHandler, dataResponse } from "@/lib/api";
import { auth } from "@/lib/auth";
import { uploadToSupabaseStorage } from "@/lib/integrations/storage";
import { AppError, requireSession } from "@/lib/server";

const MAX_BYTES = 2 * 1024 * 1024;
const allowedContentType = /^image\/(png|jpe?g|webp|gif|avif)$/;

export const POST = apiHandler(async (request) => {
  const session = await requireSession(request.headers);

  const contentType = request.headers.get("content-type")?.split(";", 1)[0] ?? "";
  if (!allowedContentType.test(contentType)) {
    throw new AppError("BAD_REQUEST", "Format gambar tidak didukung. Gunakan PNG, JPG, WEBP, GIF, atau AVIF");
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) {
    throw new AppError("BAD_REQUEST", "Gambar maksimal 2MB");
  }

  const buffer = await request.arrayBuffer();
  if (length === 0 && buffer.byteLength > MAX_BYTES) {
    throw new AppError("BAD_REQUEST", "Gambar maksimal 2MB");
  }

  const extension = contentType.split("/")[1].replace("jpeg", "jpg");
  const objectPath = `users/${session.user.id}/avatar-${Date.now()}.${extension}`;
  const { publicUrl } = await uploadToSupabaseStorage("avatars", objectPath, buffer, contentType);

  await auth.api.updateUser({
    headers: request.headers,
    body: { image: publicUrl },
  });

  return dataResponse({ image: publicUrl });
});