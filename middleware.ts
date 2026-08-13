import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge-level rate limiting for domain API routes.
 *
 * Better Auth already rate-limits /api/auth/* endpoints. This middleware adds
 * a first line of defense for /api/v1/* routes to prevent abuse and DoS.
 *
 * Note: This uses an in-memory Map, so limits are per-edge-instance (not distributed).
 * For production at scale, replace with Redis or an external rate limit service.
 * The window is generous to avoid blocking legitimate POS traffic.
 */

type Bucket = { count: number; resetAt: number };

const WINDOW_MS = 60_000; // 1 minute
const READ_LIMIT = 120; // GET requests per window
const WRITE_LIMIT = 40; // POST/PATCH/DELETE/PUT requests per window
const MAX_BUCKETS = 10_000; // prevent memory exhaustion

const buckets = new Map<string, Bucket>();

// Periodically purge expired buckets to prevent memory growth
let lastPurge = Date.now();

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

function getRateLimit(ip: string, isWrite: boolean): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const limit = isWrite ? WRITE_LIMIT : READ_LIMIT;

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

  const key = `${ip}:${isWrite ? "w" : "r"}`;
  let bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, bucket);
  }

  bucket.count++;
  const allowed = bucket.count <= limit;
  const remaining = Math.max(0, limit - bucket.count);

  return { allowed, remaining, resetAt: bucket.resetAt };
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only rate-limit domain API routes; Better Auth handles /api/auth/*
  if (!pathname.startsWith("/api/v1/")) {
    return NextResponse.next();
  }

  // Health check is exempt
  if (pathname === "/api/v1/health") {
    return NextResponse.next();
  }

  // Webhook endpoints use signature-based auth, exempt from IP rate limiting
  if (pathname.startsWith("/api/v1/webhooks/") || pathname === "/api/v1/integrations/payments/webhook") {
    return NextResponse.next();
  }

  const ip = getClientIp(request);
  const isWrite = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  const { allowed, remaining, resetAt } = getRateLimit(ip, isWrite);

  const headers = new Headers({
    "x-ratelimit-limit": String(isWrite ? WRITE_LIMIT : READ_LIMIT),
    "x-ratelimit-remaining": String(remaining),
    "x-ratelimit-reset": String(Math.ceil(resetAt / 1000)),
  });

  if (!allowed) {
    const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Terlalu banyak permintaan. Coba lagi sebentar." }, requestId: crypto.randomUUID() },
      { status: 429, headers: { ...headers, "retry-after": String(retryAfter) } },
    );
  }

  const response = NextResponse.next();
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: ["/api/v1/:path*"],
};
