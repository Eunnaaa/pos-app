import "server-only";

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export type LogMeta = Record<string, unknown>;

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

const MIN_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || "info";

/** Fields whose values are redacted to prevent leaking PII or secrets in logs. */
const SENSITIVE_KEYS = new Set([
  "password",
  "passwd",
  "secret",
  "token",
  "accesstoken",
  "refreshtoken",
  "authorization",
  "apikey",
  "api_key",
  "clientsecret",
  "serverkey",
  "servicekey",
  "servicerolekey",
  "session",
  "cookie",
  "creditcard",
  "cardnumber",
  "cvv",
]);

function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redact);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    const lower = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lower)) {
      out[key] = "[redacted]";
    } else {
      out[key] = redact(val);
    }
  }
  return out;
}

function emit(level: LogLevel, message: string, meta?: LogMeta, error?: unknown): void {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[MIN_LEVEL]) return;

  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(redact(meta || {}) as Record<string, unknown>),
  };

  if (error) {
    if (error instanceof Error) {
      entry.error = { name: error.name, message: error.message, stack: error.stack };
    } else {
      entry.error = String(error);
    }
  }

  // BigInt is not JSON-serializable; convert to string
  const safe = JSON.stringify(entry, (_key, value) =>
    typeof value === "bigint" ? `${value}n` : value,
  );

  if (level === "error" || level === "fatal") {
    console.error(safe);
  } else if (level === "warn") {
    console.warn(safe);
  } else {
    console.log(safe);
  }
}

export const logger = {
  debug: (message: string, meta?: LogMeta) => emit("debug", message, meta),
  info: (message: string, meta?: LogMeta) => emit("info", message, meta),
  warn: (message: string, meta?: LogMeta) => emit("warn", message, meta),
  error: (message: string, meta?: LogMeta, error?: unknown) => emit("error", message, meta, error),
  fatal: (message: string, meta?: LogMeta, error?: unknown) => emit("fatal", message, meta, error),
};
