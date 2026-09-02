import "server-only";
import { scrubSensitiveText, scrubTelemetryValue } from "@/lib/observability/scrub";

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

function emit(level: LogLevel, message: string, meta?: LogMeta, error?: unknown): void {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[MIN_LEVEL]) return;

  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    message: scrubSensitiveText(message),
    ...(scrubTelemetryValue(meta || {}) as Record<string, unknown>),
  };

  if (error) {
    if (error instanceof Error) {
      entry.error = {
        name: error.name,
        message: scrubSensitiveText(error.message),
        stack: error.stack ? scrubSensitiveText(error.stack) : undefined,
      };
    } else {
      entry.error = scrubSensitiveText(String(error));
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
