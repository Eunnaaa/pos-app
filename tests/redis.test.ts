import assert from "node:assert/strict";
import test from "node:test";
import { RedisKeys } from "@/lib/redis/keys";
import { cacheGet, cacheSet, cacheDel, acquireLock, releaseLock } from "@/lib/redis/client";

void test("Redis multi-tenant key generators follow strict naming structure", () => {
  const orgId = "org-123";
  const branchId = "branch-456";
  const variantId = "var-001";

  assert.equal(RedisKeys.catalog(orgId, branchId), "tenant:org-123:branch:branch-456:catalog");
  assert.equal(RedisKeys.catalog(orgId), "tenant:org-123:catalog");
  assert.equal(RedisKeys.categories(orgId), "tenant:org-123:categories");
  assert.equal(RedisKeys.tables(orgId, branchId), "tenant:org-123:branch:branch-456:tables");
  assert.equal(RedisKeys.stockLock(variantId), "lock:stock:var-001");
  assert.equal(RedisKeys.kdsChannel(branchId), "channel:kds:branch-456");
  assert.equal(RedisKeys.orderEventsChannel(orgId, branchId), "events:org:org-123:branch:branch-456");
  assert.equal(RedisKeys.idempotency("key-abc"), "idempotency:key-abc");
});

void test("Redis client handles fail-open gracefully when unconfigured or offline", async () => {
  // In test environment without Redis credentials, methods must gracefully fail-open
  const cached = await cacheGet<string>("test-key");
  assert.equal(cached, null);

  const setResult = await cacheSet("test-key", { test: true });
  assert.equal(typeof setResult, "boolean");

  const delResult = await cacheDel("test-key");
  assert.equal(typeof delResult, "number");

  const lockResult = await acquireLock("test-lock");
  assert.equal(lockResult, true); // Fail-open allows request

  await assert.doesNotReject(async () => {
    await releaseLock("test-lock");
  });
});
