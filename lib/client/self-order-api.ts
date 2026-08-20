"use client";

export type SelfOrderApiEnvelope<T> = { data: T };

export class SelfOrderApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "SelfOrderApiError";
    this.status = status;
    this.code = code;
  }
}

export async function selfOrderFetch<T>(
  path: string,
  options: RequestInit & { idempotencyKey?: string; token?: string } = {},
): Promise<SelfOrderApiEnvelope<T>> {
  const method = (options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers);
  const mutating = ["POST", "PATCH", "DELETE"].includes(method);
  const idempotencyKey = options.idempotencyKey || headers.get("idempotency-key") || (mutating ? crypto.randomUUID() : undefined);
  if (idempotencyKey) headers.set("idempotency-key", idempotencyKey);
  if (options.token) headers.set("x-self-order-token", options.token);
  if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");

  if (options.body && typeof options.body === "string" && !headers.has("x-self-order-token")) {
    try {
      const parsed = JSON.parse(options.body) as Record<string, unknown>;
      if (parsed && typeof parsed === "object" && typeof parsed.token === "string") {
        headers.set("x-self-order-token", parsed.token);
      }
    } catch {
      // Abaikan error parse bila body bukan JSON
    }
  }

  const response = await fetch(path, { ...options, method, headers, cache: "no-store" });
  const payload = response.status === 204 ? { data: null } : await response.json().catch(() => ({ data: null }));
  if (!response.ok) {
    throw new SelfOrderApiError(
      (payload as { error?: { message?: string } }).error?.message || "Permintaan gagal",
      response.status,
      (payload as { error?: { code?: string } }).error?.code,
    );
  }
  return payload as SelfOrderApiEnvelope<T>;
}
