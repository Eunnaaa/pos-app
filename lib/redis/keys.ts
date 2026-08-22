/**
 * Standardized multi-tenant Redis key conventions for Kedai-Ku.
 */

export const RedisKeys = {
  // Catalog & Products Caching
  catalog: (orgId: string, branchId?: string | null) =>
    `tenant:${orgId}${branchId ? `:branch:${branchId}` : ""}:catalog`,

  categories: (orgId: string) =>
    `tenant:${orgId}:categories`,

  tables: (orgId: string, branchId?: string | null) =>
    `tenant:${orgId}${branchId ? `:branch:${branchId}` : ""}:tables`,

  // Idempotency & Concurrency Locks
  idempotency: (key: string) =>
    `idempotency:${key}`,

  stockLock: (variantId: string) =>
    `lock:stock:${variantId}`,

  // Real-time Pub/Sub Channels
  kdsChannel: (branchId: string) =>
    `channel:kds:${branchId}`,

  orderEventsChannel: (orgId: string, branchId: string) =>
    `events:org:${orgId}:branch:${branchId}`,
} as const;
