import "server-only";
import { AppError } from "./errors";

export type SupportedImageType = "image/png" | "image/jpeg" | "image/webp" | "image/gif" | "image/avif";

const extensions: Record<SupportedImageType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function hasValidSignature(bytes: Uint8Array, type: SupportedImageType): boolean {
  if (type === "image/png") return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (type === "image/jpeg") return startsWith(bytes, [0xff, 0xd8, 0xff]);
  if (type === "image/gif") {
    const header = new TextDecoder("ascii").decode(bytes.slice(0, 6));
    return header === "GIF87a" || header === "GIF89a";
  }
  if (type === "image/webp") {
    return new TextDecoder("ascii").decode(bytes.slice(0, 4)) === "RIFF"
      && new TextDecoder("ascii").decode(bytes.slice(8, 12)) === "WEBP";
  }
  if (type === "image/avif") {
    const marker = new TextDecoder("ascii").decode(bytes.slice(4, 12));
    return marker.startsWith("ftyp") && ["avif", "avis"].includes(marker.slice(4));
  }
  return false;
}

export function validateImageBytes(
  data: ArrayBuffer | Uint8Array,
  contentType: string,
  allowedTypes: readonly SupportedImageType[],
): { contentType: SupportedImageType; extension: string } {
  const normalized = contentType === "image/jpg" ? "image/jpeg" : contentType;
  if (!allowedTypes.includes(normalized as SupportedImageType)) {
    throw new AppError("VALIDATION_ERROR", "Format gambar tidak didukung");
  }
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (!hasValidSignature(bytes, normalized as SupportedImageType)) {
    throw new AppError("VALIDATION_ERROR", "Isi file tidak sesuai dengan format gambar");
  }
  return {
    contentType: normalized as SupportedImageType,
    extension: extensions[normalized as SupportedImageType],
  };
}
