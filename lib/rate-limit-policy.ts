export const RATE_LIMIT_WINDOW_MS = 60_000;

export const API_RATE_LIMITS = {
  internal: { read: 120, write: 40 },
  selfOrder: { read: 300, write: 60 },
  webhook: 300,
} as const;

export type RateLimitPolicy = {
  bucket: string;
  limit: number;
};

export function resolveRateLimitPolicy(pathname: string, method: string): RateLimitPolicy {
  const isWrite = !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
  const isSelfOrder = pathname.startsWith("/api/v1/self-order/");
  const isWebhook = pathname.startsWith("/api/v1/webhooks/")
    || pathname === "/api/v1/integrations/payments/webhook";

  if (isWebhook) return { bucket: "webhook", limit: API_RATE_LIMITS.webhook };
  if (isSelfOrder) {
    return {
      bucket: `${isWrite ? "w" : "r"}-self`,
      limit: isWrite ? API_RATE_LIMITS.selfOrder.write : API_RATE_LIMITS.selfOrder.read,
    };
  }
  return {
    bucket: isWrite ? "w" : "r",
    limit: isWrite ? API_RATE_LIMITS.internal.write : API_RATE_LIMITS.internal.read,
  };
}
