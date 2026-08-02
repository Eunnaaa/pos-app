import "server-only";
import { AppError } from "@/lib/server";

export async function providerRequest<T>(
  provider: string,
  url: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let payload: unknown = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text.slice(0, 1_000); }
  if (!response.ok) {
    throw new AppError("BAD_REQUEST", `${provider} request failed`, {
      details: { provider, status: response.status, response: payload },
    });
  }
  return payload as T;
}

export function requireProviderConfig(provider: string, values: Record<string, string | undefined>): Record<string, string> {
  const missing = Object.entries(values).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new AppError("BAD_REQUEST", `${provider} is not configured`, { details: { missing } });
  return Object.fromEntries(Object.entries(values) as [string, string][]);
}
