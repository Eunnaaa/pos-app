import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { Redis } from "@upstash/redis";
import { routing } from "./i18n/routing";
import { RATE_LIMIT_WINDOW_MS, resolveRateLimitPolicy } from "./lib/rate-limit-policy";

/**
 * Edge-level rate limiting for domain API routes.
 *
 * Better Auth already rate-limits /api/auth/* endpoints. This middleware adds
 * a first line of defense for /api/v1/* routes to prevent abuse and DoS.
 *
 * Upstash Redis provides a distributed counter when configured. The bounded
 * in-memory map is a development/fail-safe fallback.
 */

type Bucket = { count: number; resetAt: number };

const MAX_BUCKETS = 10_000; // prevent memory exhaustion

const buckets = new Map<string, Bucket>();
let redis: Redis | null | undefined;

const incrementWithTtlScript = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then redis.call("EXPIRE", KEYS[1], ARGV[1]) end
local ttl = redis.call("TTL", KEYS[1])
return {current, ttl}
`;

// Periodically purge expired buckets to prevent memory growth
let lastPurge = Date.now();

function getClientIp(request: NextRequest): string {
  const trustProxy = process.env.TRUST_PROXY === "true" || process.env.VERCEL === "1";
  if (trustProxy) {
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]!.trim().slice(0, 64);
    const realIp = request.headers.get("x-real-ip");
    if (realIp) return realIp.trim().slice(0, 64);
  }
  return "unknown";
}

function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  try {
    if (url) new URL(url);
    redis = url && token ? new Redis({ url, token }) : null;
  } catch {
    redis = null;
  }
  return redis;
}

function getLocalRateLimit(key: string, limit: number): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();

  // Purge expired buckets every 5 minutes
  if (now - lastPurge > 300_000) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt < now) buckets.delete(key);
    }
    lastPurge = now;
  }

  // Enforce max bucket count
  if (buckets.size > MAX_BUCKETS) {
    // Emergency eviction: clear oldest entries
    const entries = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
    for (let i = 0; i < MAX_BUCKETS / 2; i++) {
      buckets.delete(entries[i]![0]);
    }
  }

  let bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    buckets.set(key, bucket);
  }

  bucket.count++;
  const allowed = bucket.count <= limit;
  const remaining = Math.max(0, limit - bucket.count);

  return { allowed, remaining, resetAt: bucket.resetAt };
}

async function getRateLimit(key: string, limit: number): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const client = getRedis();
  if (!client) return getLocalRateLimit(key, limit);
  try {
    const redisKey = `ratelimit:v1:${key}`;
    const result = await client.eval(
      incrementWithTtlScript,
      [redisKey],
      [Math.ceil(RATE_LIMIT_WINDOW_MS / 1_000)],
    ) as [number, number];
    const count = Number(result[0]);
    const ttl = Number(result[1]);
    const resetAt = Date.now() + Math.max(1, ttl) * 1_000;
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetAt };
  } catch {
    return getLocalRateLimit(key, limit);
  }
}

async function handleRateLimit(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Health check is exempt
  if (pathname === "/api/v1/health") {
    return NextResponse.next();
  }

  const ip = getClientIp(request);
  const policy = resolveRateLimitPolicy(pathname, request.method);
  const { allowed, remaining, resetAt } = await getRateLimit(`${ip}:${policy.bucket}`, policy.limit);

  const headers = new Headers({
    "x-ratelimit-limit": String(policy.limit),
    "x-ratelimit-remaining": String(remaining),
    "x-ratelimit-reset": String(Math.ceil(resetAt / 1000)),
  });

  if (!allowed) {
    const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Terlalu banyak permintaan. Coba lagi sebentar." }, requestId: crypto.randomUUID() },
      { status: 429, headers: new Headers([...headers.entries(), ["retry-after", String(retryAfter)]]) },
    );
  }

  const response = NextResponse.next();
  for (const [key, value] of headers.entries()) {
    response.headers.set(key, value);
  }
  return response;
}

const intlMiddleware = createMiddleware(routing);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only rate-limit domain API routes; Better Auth handles /api/auth/*
  if (pathname.startsWith("/api/v1/")) {
    return handleRateLimit(request);
  }

  const response = intlMiddleware(request);
  if (process.env.NODE_ENV !== "production") {
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
  }
  return response;
}

export const config = {
  // Matcher from next-intl defaults + API route rate limiting.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)", "/api/v1/:path*"],
};
