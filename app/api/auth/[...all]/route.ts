import { getAuth } from "@/lib/auth";

function resolveOrigin(req: Request): string {
  const forwardedProto = req.headers.get("x-forwarded-proto") || (req.url.startsWith("https:") ? "https" : "http");
  const forwardedHost = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  const origin = req.headers.get("origin");
  if (origin) return origin;
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {}
  }
  return "http://localhost:3000";
}

export const POST = async (req: Request) => {
  const origin = resolveOrigin(req);
  return getAuth(origin).handler(req);
};

export const GET = async (req: Request) => {
  const origin = resolveOrigin(req);
  return getAuth(origin).handler(req);
};