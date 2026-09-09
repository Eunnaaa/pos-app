import { getServerEnv, getTrustedOrigins } from "@/config/env";
import { getAuth } from "@/lib/auth";
import { resolveAuthOrigin } from "@/lib/server/auth-origin";

const env = getServerEnv();

function resolveOrigin(req: Request): string {
  return resolveAuthOrigin(req, {
    baseUrl: env.BETTER_AUTH_URL,
    trustedOrigins: getTrustedOrigins(env),
    trustProxy: env.TRUST_PROXY === "true" || process.env.VERCEL === "1" || env.NODE_ENV !== "production",
    isProduction: env.NODE_ENV === "production",
  });
}

export const POST = async (req: Request) => {
  const origin = resolveOrigin(req);
  return getAuth(origin).handler(req);
};

export const GET = async (req: Request) => {
  const origin = resolveOrigin(req);
  return getAuth(origin).handler(req);
};
