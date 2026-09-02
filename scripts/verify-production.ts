import "dotenv/config";

const strictIntegrations = process.argv.includes("--strict-integrations") || process.env.REQUIRE_PRODUCTION_INTEGRATIONS === "true";
const production = process.env.NODE_ENV === "production";
const errors: string[] = [];
const warnings: string[] = [];

function present(key: string): boolean {
  return Boolean(process.env[key]?.trim());
}

function requireKeys(keys: readonly string[], label?: string): void {
  const missing = keys.filter((key) => !present(key));
  if (missing.length) errors.push(`${label ? `${label}: ` : ""}${missing.join(", ")} missing`);
}

function requirePair(name: string, keys: readonly [string, string]): void {
  const count = keys.filter(present).length;
  if (count === 1) errors.push(`${name} configuration incomplete (${keys.join(" + ")})`);
}

function parseUrl(key: string): URL | undefined {
  const value = process.env[key]?.trim();
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (production && url.protocol !== "https:") errors.push(`${key} must use HTTPS in production`);
    return url;
  } catch {
    errors.push(`${key} must be a valid URL`);
    return undefined;
  }
}

requireKeys([
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "DATA_ENCRYPTION_KEY",
  "BETTER_AUTH_URL",
  "NEXT_PUBLIC_BETTER_AUTH_URL",
  "TRUSTED_ORIGINS",
  "SUPER_ADMIN_EMAILS",
  "WEBHOOK_SECRET",
]);

for (const key of ["BETTER_AUTH_SECRET", "DATA_ENCRYPTION_KEY", "WEBHOOK_SECRET"]) {
  if (present(key) && process.env[key]!.length < 32) errors.push(`${key} must contain at least 32 characters`);
}

const authUrl = parseUrl("BETTER_AUTH_URL");
const publicAuthUrl = parseUrl("NEXT_PUBLIC_BETTER_AUTH_URL");
if (authUrl && publicAuthUrl && authUrl.origin !== publicAuthUrl.origin) {
  errors.push("BETTER_AUTH_URL and NEXT_PUBLIC_BETTER_AUTH_URL must use the same origin");
}
if (authUrl) {
  const trustedOrigins = new Set((process.env.TRUSTED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean));
  if (!trustedOrigins.has(authUrl.origin)) errors.push("TRUSTED_ORIGINS must include the BETTER_AUTH_URL origin");
}
if (production && process.env.DATABASE_SSL !== "require") errors.push("DATABASE_SSL=require is mandatory in production");
if (present("SUPER_ADMIN_EMAILS")) {
  for (const email of process.env.SUPER_ADMIN_EMAILS!.split(",").map((value) => value.trim()).filter(Boolean)) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push(`SUPER_ADMIN_EMAILS contains an invalid email address: ${email}`);
  }
}

requirePair("Google OAuth", ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]);
requirePair("Apple OAuth", ["APPLE_CLIENT_ID", "APPLE_CLIENT_SECRET"]);
requirePair("Email", ["EMAIL_API_URL", "EMAIL_API_KEY"]);
requirePair("Upstash Redis", ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]);
requirePair("Sentry", ["SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN"]);
for (const key of ["EMAIL_API_URL", "MIDTRANS_BASE_URL", "DOKU_BASE_URL", "SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN", "UPSTASH_REDIS_REST_URL"]) {
  parseUrl(key);
}

if (present("MIDTRANS_SERVER_KEY") && process.env.MIDTRANS_BASE_URL?.replace(/\/$/, "") !== "https://api.midtrans.com") {
  errors.push("MIDTRANS_BASE_URL must be https://api.midtrans.com when a live server key is configured");
}
if (present("XENDIT_SECRET_KEY") && !present("XENDIT_CALLBACK_TOKEN")) {
  errors.push("XENDIT_CALLBACK_TOKEN is required to authenticate Xendit webhooks");
}
if (present("WHATSAPP_ACCESS_TOKEN") && process.env.WHATSAPP_ACCESS_TOKEN!.length < 8) errors.push("WHATSAPP_ACCESS_TOKEN appears invalid");
if (present("LOG_LEVEL") && !["debug", "info", "warn", "error", "fatal"].includes(process.env.LOG_LEVEL!)) {
  errors.push("LOG_LEVEL must be debug, info, warn, error, or fatal");
}

const strictKeys = [
  "MIDTRANS_SERVER_KEY",
  "XENDIT_SECRET_KEY",
  "XENDIT_CALLBACK_TOKEN",
  "EMAIL_API_URL",
  "EMAIL_API_KEY",
  "WHATSAPP_ACCESS_TOKEN",
  "SENTRY_DSN",
  "NEXT_PUBLIC_SENTRY_DSN",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
] as const;
if (strictIntegrations) requireKeys(strictKeys, "Strict integration readiness");
else for (const key of strictKeys) if (!present(key)) warnings.push(`${key} not configured`);

if (errors.length) {
  for (const error of errors) process.stderr.write(`ERROR: ${error}\n`);
  process.stderr.write(`Preflight failed with ${errors.length} error(s).\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Production preflight passed${strictIntegrations ? " in strict integration mode" : ""}.\n`);
  if (authUrl) {
    if (present("GOOGLE_CLIENT_ID")) process.stdout.write(`Google callback: ${authUrl.origin}/api/auth/callback/google\n`);
    if (present("APPLE_CLIENT_ID")) process.stdout.write(`Apple callback: ${authUrl.origin}/api/auth/callback/apple\n`);
    process.stdout.write(`Payment webhook: ${authUrl.origin}/api/v1/integrations/payments/webhook\n`);
    process.stdout.write(`Database webhook: ${authUrl.origin}/api/v1/webhooks/db\n`);
  }
  if (warnings.length) process.stdout.write(`${warnings.length} optional production setting(s) are not configured; use --strict-integrations before go-live.\n`);
}
