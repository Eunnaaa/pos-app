import "server-only";
import { getServerEnv } from "@/config/env";
import { providerRequest, requireProviderConfig } from "./http";

export async function uploadToSupabaseStorage(bucket: string, path: string, data: BodyInit, contentType: string) {
  const env = getServerEnv();
  const config = requireProviderConfig("Supabase Storage", { url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY });
  const safePath = path.split("/").map(encodeURIComponent).join("/");
  return providerRequest("Supabase Storage", `${config.url}/storage/v1/object/${encodeURIComponent(bucket)}/${safePath}`, {
    method: "POST",
    headers: { authorization: `Bearer ${config.serviceRoleKey}`, apikey: config.serviceRoleKey, "content-type": contentType, "x-upsert": "false" },
    body: data,
  });
}
