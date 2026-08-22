import "server-only";
import { Redis } from "@upstash/redis";

let redisInstance: Redis | null = null;
let isInitialized = false;

/**
 * Returns an Upstash Redis client instance if environment variables are configured.
 * Gracefully returns null if Redis is not configured or in environments without Redis.
 */
export function getRedisClient(): Redis | null {
  if (isInitialized) return redisInstance;

  try {
    const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
    const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

    if (url && token && (url.startsWith("http://") || url.startsWith("https://"))) {
      redisInstance = new Redis({
        url,
        token,
      });
    }
  } catch (error) {
    console.warn("[Redis] Failed to initialize Redis client:", error);
    redisInstance = null;
  } finally {
    isInitialized = true;
  }

  return redisInstance;
}

/**
 * Fail-Open Cache Get: Retrieves cached JSON data.
 * Returns null if cache misses, Redis is down, or on any error.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getRedisClient();
  if (!client) return null;

  try {
    const data = await client.get<T>(key);
    return data ?? null;
  } catch (error) {
    console.warn(`[Redis] Cache get failed for key "${key}":`, error);
    return null;
  }
}

/**
 * Fail-Open Cache Set: Stores data in Redis with TTL.
 */
export async function cacheSet<T>(key: string, value: T, ttlSeconds: number = 3600): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;

  try {
    await client.set(key, value, { ex: ttlSeconds });
    return true;
  } catch (error) {
    console.warn(`[Redis] Cache set failed for key "${key}":`, error);
    return false;
  }
}

/**
 * Fail-Open Cache Del: Deletes one or multiple cache keys.
 */
export async function cacheDel(...keys: string[]): Promise<number> {
  const client = getRedisClient();
  if (!client || keys.length === 0) return 0;

  try {
    return await client.del(...keys);
  } catch (error) {
    console.warn(`[Redis] Cache delete failed for keys "${keys.join(", ")}":`, error);
    return 0;
  }
}

/**
 * Fail-Open Distributed Lock (NX): Acquires lock for a specific key.
 * Returns true if lock was acquired, false if already locked or Redis unavailable.
 */
export async function acquireLock(key: string, ttlSeconds: number = 15): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return true; // Fallback: allow request if Redis is disabled

  try {
    const result = await client.set(key, "locked", { nx: true, ex: ttlSeconds });
    return Boolean(result);
  } catch (error) {
    console.warn(`[Redis] Lock acquisition failed for key "${key}":`, error);
    return true; // Fail-open to avoid blocking core operations
  }
}

/**
 * Releases a previously acquired lock.
 */
export async function releaseLock(key: string): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  try {
    await client.del(key);
  } catch (error) {
    console.warn(`[Redis] Lock release failed for key "${key}":`, error);
  }
}

/**
 * Publishes an event to a Redis channel for real-time subscribers.
 */
export async function publishEvent(channel: string, message: unknown): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  try {
    await client.publish(channel, typeof message === "string" ? message : JSON.stringify(message));
  } catch (error) {
    console.warn(`[Redis] Publish event failed for channel "${channel}":`, error);
  }
}
