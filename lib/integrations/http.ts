import "server-only";
import { AppError } from "@/lib/server";

export async function providerRequest<T>(
  provider: string,
  url: string,
  init: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new AppError("BAD_REQUEST", `${provider} is unavailable`, { details: { provider } });
  }
  const text = await response.text();
  let payload: unknown = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text.slice(0, 1_000); }
  if (!response.ok) {
    const code = response.status === 429 ? "RATE_LIMITED" : response.status >= 500 ? "INTERNAL_ERROR" : "BAD_REQUEST";
    const detailsMsg = payload && typeof payload === "object" && "error_messages" in payload && Array.isArray((payload as { error_messages: string[] }).error_messages)
      ? (payload as { error_messages: string[] }).error_messages.join(", ")
      : `${provider} request failed (${response.status})`;
    throw new AppError(code, detailsMsg, {
      details: { provider, status: response.status, payload },
    });
  }
  if (payload === null || payload === undefined) {
    throw new AppError("BAD_REQUEST", `${provider} returned an empty response`, {
      details: { provider, status: response.status },
    });
  }
  return payload as T;
}

export function requireProviderConfig(provider: string, values: Record<string, string | undefined>): Record<string, string> {
  const missing = Object.entries(values).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new AppError("BAD_REQUEST", `${provider} is not configured`, { details: { missing } });
  return Object.fromEntries(Object.entries(values) as [string, string][]);
}
