"use client";

import { enqueueOfflineMutation } from "@/lib/offline";

export const ACTIVE_ORGANIZATION_KEY = "kedai-ku-organization-id";
export const ACTIVE_BRANCH_KEY = "kedai-ku-branch-id";
export const ACTIVE_WAREHOUSE_KEY = "kedai-ku-warehouse-id";

export type ApiEnvelope<T> = { data: T; meta?: Record<string, unknown>; queued?: boolean };

type ApiOptions = RequestInit & { queueOffline?: boolean; organizationId?: string; branchId?: string };

export class ClientApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = "ClientApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function getActiveContext() {
  if (typeof window === "undefined") return {};
  return {
    organizationId: localStorage.getItem(ACTIVE_ORGANIZATION_KEY) || undefined,
    branchId: localStorage.getItem(ACTIVE_BRANCH_KEY) || undefined,
    warehouseId: localStorage.getItem(ACTIVE_WAREHOUSE_KEY) || undefined,
  };
}

export function persistActiveContext(input: { organizationId: string; branchId?: string; warehouseId?: string }) {
  localStorage.setItem(ACTIVE_ORGANIZATION_KEY, input.organizationId);
  if (input.branchId) localStorage.setItem(ACTIVE_BRANCH_KEY, input.branchId);
  else localStorage.removeItem(ACTIVE_BRANCH_KEY);
  if (input.warehouseId) localStorage.setItem(ACTIVE_WAREHOUSE_KEY, input.warehouseId);
  else localStorage.removeItem(ACTIVE_WAREHOUSE_KEY);
}

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<ApiEnvelope<T>> {
  const method = (options.method || "GET").toUpperCase();
  const active = getActiveContext();
  const organizationId = options.organizationId ?? active.organizationId;
  const branchId = options.branchId ?? active.branchId;
  const headers = new Headers(options.headers);
  if (organizationId) headers.set("x-organization-id", organizationId);
  if (branchId) headers.set("x-branch-id", branchId);
  const mutating = ["POST", "PATCH", "DELETE"].includes(method);
  const idempotencyKey = headers.get("idempotency-key") || (mutating ? crypto.randomUUID() : undefined);
  if (idempotencyKey) headers.set("idempotency-key", idempotencyKey);
  if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");

  try {
    const response = await fetch(path, { ...options, method, headers, credentials: "include", cache: "no-store" });
    const payload = response.status === 204 ? { data: null } : await response.json();
    if (!response.ok) {
      throw new ClientApiError(payload.error?.message || "Permintaan gagal", response.status, payload.error?.code, payload.error?.details);
    }
    return payload as ApiEnvelope<T>;
  } catch (error) {
    if (error instanceof ClientApiError || !mutating || !options.queueOffline || !organizationId || !idempotencyKey) throw error;
    let body: unknown = null;
    if (typeof options.body === "string") {
      try { body = JSON.parse(options.body); } catch { body = options.body; }
    }
    await enqueueOfflineMutation({
      url: path,
      method: method as "POST" | "PATCH" | "DELETE",
      organizationId,
      branchId,
      idempotencyKey,
      body,
    });
    return { data: null as T, queued: true };
  }
}
