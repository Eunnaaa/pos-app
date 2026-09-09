type AuthOriginConfig = {
  baseUrl: string;
  trustedOrigins: string[];
  trustProxy: boolean;
  isProduction: boolean;
};

function asOrigin(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function isDevTunnelOrLocal(originStr: string | null): boolean {
  if (!originStr) return false;
  try {
    const url = new URL(originStr);
    const host = url.hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.startsWith("192.168.") ||
      host.startsWith("10.") ||
      host.endsWith(".ngrok-free.app") ||
      host.endsWith(".ngrok-free.dev") ||
      host.endsWith(".ngrok.app") ||
      host.endsWith(".ngrok.io") ||
      host.endsWith(".loca.lt")
    );
  } catch {
    return false;
  }
}

/**
 * Select an auth base URL without allowing Host/X-Forwarded-Host injection.
 * Production always uses the canonical configured URL so OAuth callbacks are
 * stable. Development may use another explicitly trusted origin for tunnels.
 */
export function resolveAuthOrigin(request: Request, config: AuthOriginConfig): string {
  const canonicalOrigin = new URL(config.baseUrl).origin;
  if (config.isProduction) return canonicalOrigin;

  const allowed = new Set(config.trustedOrigins.map((origin) => new URL(origin).origin));
  allowed.add(canonicalOrigin);
  const candidates: Array<string | null> = [];

  if (config.trustProxy) {
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
    if (forwardedHost && (forwardedProto === "http" || forwardedProto === "https")) {
      candidates.push(asOrigin(`${forwardedProto}://${forwardedHost}`));
    }
  }

  candidates.push(asOrigin(request.headers.get("origin")));
  candidates.push(asOrigin(request.headers.get("referer")));
  candidates.push(asOrigin(request.url));

  // 1. Explicitly trusted origin matches
  const explicitMatch = candidates.find((candidate): candidate is string => Boolean(candidate && allowed.has(candidate)));
  if (explicitMatch) return explicitMatch;

  // 2. In dev, automatically recognize any ngrok tunnel or LAN IP
  const devMatch = candidates.find((candidate): candidate is string => Boolean(candidate && isDevTunnelOrLocal(candidate)));
  if (devMatch) return devMatch;

  return canonicalOrigin;
}

export function resolveOriginFromHeaders(headers: Headers): string {
  const forwardedHost = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const originHeader = headers.get("origin") || headers.get("referer");
  const host = headers.get("host")?.split(",")[0]?.trim();

  const candidates: Array<string | null> = [];
  if (forwardedHost) {
    candidates.push(asOrigin(`${forwardedProto || "https"}://${forwardedHost}`));
  }
  if (originHeader) {
    candidates.push(asOrigin(originHeader));
  }
  if (host) {
    const proto = forwardedProto || (host.includes("localhost") || host.startsWith("127.") || host.startsWith("192.168.") || host.startsWith("10.") ? "http" : "https");
    candidates.push(asOrigin(`${proto}://${host}`));
  }

  const devMatch = candidates.find((candidate): candidate is string => Boolean(candidate && isDevTunnelOrLocal(candidate)));
  if (devMatch) return devMatch;

  return process.env.BETTER_AUTH_URL || "http://localhost:3000";
}
