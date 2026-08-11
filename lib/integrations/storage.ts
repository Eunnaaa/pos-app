import "server-only";
import { getServerEnv } from "@/config/env";
import { AppError } from "@/lib/server";
import { requireProviderConfig } from "./http";

export async function uploadToSupabaseStorage(bucket: string, path: string, data: BodyInit, contentType: string): Promise<{ path: string; publicUrl: string }> {
  if (!/^[a-zA-Z0-9._-]+$/.test(bucket) || !path || path.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new AppError("VALIDATION_ERROR", "Invalid storage path");
  }
  const env = getServerEnv();
  const config = requireProviderConfig("Supabase Storage", { url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY });
  const safePath = path.split("/").map(encodeURIComponent).join("/");
  const url = `${config.url.replace(/\/$/, "")}/storage/v1/object/${encodeURIComponent(bucket)}/${safePath}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${config.serviceRoleKey}`, apikey: config.serviceRoleKey, "content-type": contentType, "x-upsert": "false" },
      body: data,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new AppError("BAD_REQUEST", "Supabase Storage is unavailable", { details: { provider: "Supabase Storage" } });
  }
  if (!response.ok) {
    const code = response.status === 429 ? "RATE_LIMITED" : response.status >= 500 ? "INTERNAL_ERROR" : "BAD_REQUEST";
    throw new AppError(code, "Supabase Storage upload failed", { details: { provider: "Supabase Storage", status: response.status } });
  }
  return { path: safePath, publicUrl: `${config.url.replace(/\/$/, "")}/storage/v1/object/public/${encodeURIComponent(bucket)}/${safePath}` };
}

export async function getStorageSignedUrl(bucket: string, path: string, expiresInSeconds = 3600): Promise<{ signedUrl: string; expiresIn: number }> {
  const env = getServerEnv();
  const config = requireProviderConfig("Supabase Storage", { url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY });
  const safePath = path.split("/").map(encodeURIComponent).join("/");
  const url = `${config.url.replace(/\/$/, "")}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${safePath}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${config.serviceRoleKey}`, apikey: config.serviceRoleKey, "content-type": "application/json" },
      body: JSON.stringify({ expiresIn: expiresInSeconds }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new AppError("BAD_REQUEST", "Supabase Storage is unavailable", { details: { provider: "Supabase Storage" } });
  }
  const payload = await response.json() as { signedURL?: string; error?: string };
  if (!response.ok || !payload.signedURL) {
    const code = response.status === 429 ? "RATE_LIMITED" : response.status >= 500 ? "INTERNAL_ERROR" : "BAD_REQUEST";
    throw new AppError(code, "Supabase Storage sign failed", { details: { provider: "Supabase Storage", status: response.status, message: payload.error } });
  }
  return { signedUrl: `${config.url.replace(/\/$/, "")}${payload.signedURL}`, expiresIn: expiresInSeconds };
}

/** Transform an existing Supabase Storage URL (public or signed) for responsive images via the image CDN. */
export function transformImageUrl(inputUrl: string, options: { width?: number; quality?: number } = {}): string {
  const url = new URL(inputUrl);
  const search = new URLSearchParams(url.search);
  if (options.width) search.set("width", String(options.width));
  if (options.quality) search.set("quality", String(options.quality));
  url.search = search.toString();
  return url.toString();
}
