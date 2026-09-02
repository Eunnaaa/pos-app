import "server-only";
import { z } from "zod";

const optionalUrl = z.preprocess((value) => {
  if (typeof value !== "string") return undefined;
  let trimmed = value.trim();
  if (!trimmed || trimmed === "..." || trimmed.includes("your_") || trimmed.includes("your-") || trimmed.startsWith("<")) {
    return undefined;
  }
  const cleanPart = trimmed.split(/\s+/)[0];
  if (cleanPart) trimmed = cleanPart;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return trimmed;
    }
    return undefined;
  } catch {
    return undefined;
  }
}, z.string().url().optional());

const originUrl = z.string().url().refine((value) => {
  try {
    const parsed = new URL(value);
    return parsed.origin === value.replace(/\/$/, "")
      && !parsed.username
      && !parsed.password
      && !parsed.search
      && !parsed.hash;
  } catch {
    return false;
  }
}, "must be an origin only (for example https://pos.example.com)");

const trustedOrigins = z.string().optional().refine((value) => {
  if (!value?.trim()) return true;
  return value.split(",").every((entry) => {
    const candidate = entry.trim();
    if (!candidate) return false;
    try {
      const parsed = new URL(candidate);
      return ["http:", "https:"].includes(parsed.protocol)
        && parsed.origin === candidate.replace(/\/$/, "")
        && !parsed.username
        && !parsed.password;
    } catch {
      return false;
    }
  });
}, "must contain comma-separated HTTP(S) origins without paths");

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DATABASE_SSL: z.enum(["disable", "require"]).default("require"),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must contain at least 32 characters"),
  DATA_ENCRYPTION_KEY: z.string().min(32, "DATA_ENCRYPTION_KEY must contain at least 32 characters").optional(),
  SUPER_ADMIN_EMAILS: z.string().optional(),
  BETTER_AUTH_URL: originUrl.default("http://localhost:3000"),
  NEXT_PUBLIC_BETTER_AUTH_URL: originUrl.optional(),
  TRUSTED_ORIGINS: trustedOrigins,
  TRUST_PROXY: z.enum(["true", "false"]).default("false"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  APPLE_CLIENT_ID: z.string().optional(),
  APPLE_CLIENT_SECRET: z.string().optional(),
  SUPABASE_URL: optionalUrl,
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  WEBHOOK_SECRET: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(32).optional(),
  ),
  MIDTRANS_SERVER_KEY: z.string().optional(),
  MIDTRANS_BASE_URL: optionalUrl,
  XENDIT_SECRET_KEY: z.string().optional(),
  XENDIT_CALLBACK_TOKEN: z.string().optional(),
  DOKU_CLIENT_ID: z.string().optional(),
  DOKU_SECRET_KEY: z.string().optional(),
  DOKU_BASE_URL: optionalUrl,
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  EMAIL_PROVIDER: z.enum(["resend", "sendgrid", "generic"]).default("generic"),
  EMAIL_FROM: z.string().email().optional(),
  EMAIL_API_URL: optionalUrl,
  EMAIL_API_KEY: z.string().optional(),
  AI_BASE_URL: optionalUrl,
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("claude-sonnet-5"),
  SENTRY_DSN: optionalUrl,
  UPSTASH_REDIS_REST_URL: optionalUrl,
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
}).superRefine((env, ctx) => {
  const providerPairs = [
    ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    ["APPLE_CLIENT_ID", "APPLE_CLIENT_SECRET"],
  ] as const;
  for (const [clientId, clientSecret] of providerPairs) {
    if (Boolean(env[clientId]?.trim()) !== Boolean(env[clientSecret]?.trim())) {
      ctx.addIssue({
        code: "custom",
        path: [clientId],
        message: `${clientId} and ${clientSecret} must be configured together`,
      });
    }
  }
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (cachedEnv) return cachedEnv;

  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join(", ");
    throw new Error(`Invalid server environment: ${details}`);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

export function getTrustedOrigins(env = getServerEnv()): string[] {
  const configured = env.TRUSTED_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const origins = new Set([env.BETTER_AUTH_URL.replace(/\/$/, ""), ...(configured ?? []).map((origin) => origin.replace(/\/$/, ""))]);
  if (env.NODE_ENV !== "production") {
    origins.add("http://localhost:3000");
    origins.add("http://127.0.0.1:3000");
    origins.add("http://192.168.10.167:3000");
    origins.add("http://192.168.100.163:3000");
    origins.add("https://guru-convent-unaired.ngrok-free.dev");
    origins.add("https://guru-convent-unaired.ngrok-free.app");
    origins.add("https://kedaiku-pos.loca.lt");
  }
  return Array.from(origins);
}
