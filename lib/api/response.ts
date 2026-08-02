import type { JsonValue } from "@/db/schema";

function normalizeJson(value: unknown): JsonValue {
  if (value === null) return null;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, normalizeJson(item)]),
    );
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

export function toJsonValue(value: unknown): JsonValue {
  return normalizeJson(value);
}

export function dataResponse(data: unknown, init: ResponseInit = {}, meta?: unknown): Response {
  return Response.json(
    {
      data: normalizeJson(data),
      ...(meta === undefined ? {} : { meta: normalizeJson(meta) }),
    },
    {
      ...init,
      headers: {
        "cache-control": "no-store",
        ...Object.fromEntries(new Headers(init.headers).entries()),
      },
    },
  );
}
