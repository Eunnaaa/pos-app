const SENSITIVE_KEY_PARTS = [
  "password",
  "passwd",
  "secret",
  "token",
  "authorization",
  "apikey",
  "clientsecret",
  "serverkey",
  "servicekey",
  "servicerolekey",
  "session",
  "cookie",
  "creditcard",
  "cardnumber",
  "cvv",
];

function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isSensitiveTelemetryKey(key: string): boolean {
  const normalized = normalizedKey(key);
  return SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part));
}

export function scrubSensitiveText(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\b(password|passwd|secret|token|api[_-]?key|client[_-]?secret|server[_-]?key)\b\s*[:=]\s*([^\s,;&]+)/gi, "$1=[redacted]")
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[redacted-card]");
}

export function scrubTelemetryValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return scrubSensitiveText(value);
  if (typeof value !== "object") return value;
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => scrubTelemetryValue(item, seen));

  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    output[key] = isSensitiveTelemetryKey(key) ? "[redacted]" : scrubTelemetryValue(nested, seen);
  }
  return output;
}

export function scrubSentryEvent<T>(event: T): T {
  return scrubTelemetryValue(event) as T;
}
