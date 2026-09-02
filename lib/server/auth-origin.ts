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
  const candidates: Array<string | null> = [asOrigin(request.url)];

  if (config.trustProxy) {
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    if (forwardedHost && (forwardedProto === "http" || forwardedProto === "https")) {
      candidates.unshift(asOrigin(`${forwardedProto}://${forwardedHost}`));
    }
  }

  candidates.push(asOrigin(request.headers.get("origin")));
  candidates.push(asOrigin(request.headers.get("referer")));
  return candidates.find((candidate): candidate is string => Boolean(candidate && allowed.has(candidate)))
    ?? canonicalOrigin;
}
