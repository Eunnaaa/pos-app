import { networkInterfaces } from "node:os";
import { apiHandler, dataResponse } from "@/lib/api";
import { getServerEnv } from "@/config/env";
import { AppError } from "@/lib/server";

function getLocalIpAddress(): string | null {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return null;
}

async function detectNgrokPublicUrl(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000);
    const res = await fetch("http://127.0.0.1:4040/api/tunnels", {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = (await res.json()) as { tunnels?: { public_url?: string; proto?: string }[] };
    const httpsTunnel = data.tunnels?.find((t) => t.proto === "https") || data.tunnels?.[0];
    return httpsTunnel?.public_url || null;
  } catch {
    return null;
  }
}

export const GET = apiHandler(async (request) => {
  const env = getServerEnv();
  if (env.NODE_ENV === "production") {
    throw new AppError("NOT_FOUND", "Endpoint is only available during local development");
  }

  // 1. Check active local Ngrok tunnel first (best for external mobile devices)
  const ngrokUrl = await detectNgrokPublicUrl();
  if (ngrokUrl) {
    return dataResponse({
      publicUrl: ngrokUrl,
      source: "ngrok_tunnel",
    });
  }

  // 2. Check BETTER_AUTH_URL if it is not localhost
  if (env.BETTER_AUTH_URL && !env.BETTER_AUTH_URL.includes("localhost") && !env.BETTER_AUTH_URL.includes("127.0.0.1")) {
    return dataResponse({
      publicUrl: env.BETTER_AUTH_URL.replace(/\/+$/, ""),
      source: "better_auth_url",
    });
  }

  // 3. Check Local WiFi / LAN IP (e.g. http://192.168.1.13:3000)
  const localIp = getLocalIpAddress();
  if (localIp) {
    const port = new URL(request.url).port || "3000";
    return dataResponse({
      publicUrl: `http://${localIp}:${port}`,
      source: "local_wifi_ip",
    });
  }

  // 4. Fallback to origin
  const origin = new URL(request.url).origin;
  return dataResponse({
    publicUrl: origin,
    source: "request_origin",
  });
});
