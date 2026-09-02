import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getServerEnv } from "@/config/env";
import { AppError } from "./errors";

const PREFIX = "enc:v1";

function encryptionKey(): Buffer {
  const env = getServerEnv();
  if (!env.DATA_ENCRYPTION_KEY && env.NODE_ENV === "production") {
    throw new AppError("INTERNAL_ERROR", "DATA_ENCRYPTION_KEY must be configured before storing credentials");
  }
  return createHash("sha256")
    .update(env.DATA_ENCRYPTION_KEY || env.BETTER_AUTH_SECRET, "utf8")
    .digest();
}

export function isEncryptedSecret(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(`${PREFIX}:`);
}

export function encryptSecret(value: string): string {
  if (isEncryptedSecret(value)) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(":");
}

export function decryptSecret(value: unknown): string {
  if (typeof value !== "string") return "";
  if (!isEncryptedSecret(value)) return value;

  try {
    const [, , ivValue, tagValue, ciphertextValue] = value.split(":");
    if (!ivValue || !tagValue || !ciphertextValue) throw new Error("invalid envelope");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new AppError("INTERNAL_ERROR", "Stored credential could not be decrypted");
  }
}

export function safeEqualSecret(supplied: string, expected: string): boolean {
  const suppliedDigest = createHash("sha256").update(supplied, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(suppliedDigest, expectedDigest);
}
