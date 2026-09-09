import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, twoFactor } from "better-auth/plugins";
import { getServerEnv, getTrustedOrigins } from "@/config/env";
import { db } from "@/db";
import { account, session, twoFactor as twoFactorTable, user, verification } from "@/db/schema";
import { sendEmail, sendResetPasswordEmail } from "@/lib/integrations/notifications";
import { getRedisClient } from "@/lib/redis";
import { isDevTunnelOrLocal, resolveOriginFromHeaders } from "@/lib/server/auth-origin";

const env = getServerEnv();
const isProduction = env.NODE_ENV === "production";
const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
const appleEnabled = Boolean(env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET);
const emailEnabled = Boolean(env.EMAIL_API_URL && env.EMAIL_API_KEY);
const redis = getRedisClient();

const incrementWithTtlScript = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then redis.call("EXPIRE", KEYS[1], ARGV[1]) end
return current
`;

const authInstances = new Map<string, ReturnType<typeof createBetterAuthInstance>>();

function createBetterAuthInstance(baseURL: string) {
  return betterAuth({
    appName: "Kedai-Ku",
    baseURL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user,
        account,
        session,
        verification,
        twoFactor: twoFactorTable,
      },
    }),
    ...(redis
      ? {
          secondaryStorage: {
            get: async (key: string) => {
              const res = await redis.get(key);
              if (res === null || res === undefined) return null;
              return typeof res === "string" ? res : JSON.stringify(res);
            },
            getAndDelete: async (key: string) => {
              let res: unknown = null;
              try {
                const client = redis as unknown as { getdel?: (k: string) => Promise<unknown> };
                if (typeof client.getdel === "function") {
                  res = await client.getdel(key);
                } else {
                  throw new Error("getdel not available");
                }
              } catch {
                res = await redis.get(key);
                if (res !== null && res !== undefined) {
                  await redis.del(key);
                }
              }
              if (res === null || res === undefined) return null;
              return typeof res === "string" ? res : JSON.stringify(res);
            },
            increment: async (key: string, ttl: number) => Number(await redis.eval(incrementWithTtlScript, [key], [ttl])),
            set: async (key: string, value: string, ttl?: number) => {
              if (ttl) await redis.set(key, value, { ex: ttl });
              else await redis.set(key, value);
            },
            delete: async (key: string) => { await redis.del(key); },
          },
        }
      : {}),
    trustedOrigins: (request?: Request) => {
      const allowed = new Set(getTrustedOrigins(env));
      if (!isProduction && request) {
        const originHeader = request.headers.get("origin") || request.headers.get("referer");
        if (originHeader && isDevTunnelOrLocal(originHeader)) {
          try {
            allowed.add(new URL(originHeader).origin);
          } catch {}
        }
      }
      return Array.from(allowed);
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      // Require email verification only when an email provider is configured.
      // In dev without email config, sign-up is immediately usable.
      ...(emailEnabled
        ? {
            requireEmailVerification: true,
            sendVerificationEmail: async ({ user, url }: { user: { email: string }; url: string }) => {
              await sendEmail(
                user.email,
                "Verifikasi Email — Kedai-Ku",
                `<p>Terima kasih telah mendaftar di Kedai-Ku.</p><p>Klik tautan berikut untuk memverifikasi alamat email Anda:</p><p><a href="${url}" style="display:inline-block;padding:10px 20px;background:#059669;color:#fff;border-radius:6px;text-decoration:none;">Verifikasi Email</a></p><p>Atau salin tautan ini ke browser Anda:<br/>${url}</p><p>Jika Anda tidak mendaftar di Kedai-Ku, abaikan email ini.</p>`,
              );
            },
            sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
              await sendResetPasswordEmail(user.email, url);
            },
          }
        : {}),
    },
    socialProviders: {
      ...(googleEnabled
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID!,
              clientSecret: env.GOOGLE_CLIENT_SECRET!,
            },
          }
        : {}),
      ...(appleEnabled
        ? {
            apple: {
              clientId: env.APPLE_CLIENT_ID!,
              clientSecret: env.APPLE_CLIENT_SECRET!,
            },
          }
        : {}),
    },
    account: {
      encryptOAuthTokens: true,
      skipStateCookieCheck: !isProduction || env.TRUST_PROXY === "true",
      accountLinking: {
        enabled: true,
        trustedProviders: ["google", "apple", "email-password"],
        allowDifferentEmails: false,
        allowUnlinkingAll: false,
      },
    },
    user: {
      additionalFields: {
        activeOrganizationId: { type: "string", required: false, input: false },
        locale: { type: "string", required: false, defaultValue: "id-ID" },
        metadata: { type: "json", required: false, input: false },
      },
      ...(emailEnabled
        ? {
            changeEmail: {
              enabled: true,
              sendChangeEmailConfirmation: async ({ newEmail, url }: { newEmail: string; url: string }) => {
                await sendEmail(
                  newEmail,
                  "Konfirmasi Email Baru — Kedai-Ku",
                  `<p>Kami menerima permintaan untuk mengubah email akun Kedai-Ku Anda menjadi <strong>${newEmail}</strong>.</p><p>Klik tautan berikut untuk mengonfirmasi perubahan email:</p><p><a href="${url}" style="display:inline-block;padding:10px 20px;background:#059669;color:#fff;border-radius:6px;text-decoration:none;">Konfirmasi Email Baru</a></p><p>Atau salin tautan ini ke browser Anda:<br/>${url}</p><p>Jika Anda tidak meminta perubahan ini, abaikan email ini.</p>`,
                );
              },
            },
          }
        : {}),
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      freshAge: 60 * 60 * 12,
      storeSessionInDatabase: true,
      cookieCache: { enabled: true, maxAge: 60 * 2 },
    },
    rateLimit: {
      enabled: true,
      storage: redis ? "secondary-storage" : "memory",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 60, max: 5 },
        "/forget-password": { window: 300, max: 3 },
        "/send-verification-email": { window: 300, max: 3 },
        "/verify-email": { window: 60, max: 10 },
      },
    },
    advanced: {
      trustedProxyHeaders: true,
      ipAddress: {
        ipAddressHeaders: env.TRUST_PROXY === "true" || process.env.VERCEL === "1" || !isProduction
          ? ["x-forwarded-for", "x-real-ip"]
          : [],
      },
      useSecureCookies: isProduction,
      disableCSRFCheck: false,
      disableOriginCheck: false,
      crossSubDomainCookies: { enabled: false },
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: isProduction || baseURL.startsWith("https://"),
        path: "/",
      },
    },
    plugins: [
      admin({
        defaultRole: "user",
        adminRoles: ["admin"],
        impersonationSessionDuration: 60 * 30,
      }),
      twoFactor({
        issuer: "Kedai-Ku",
        totpOptions: { period: 30, digits: 6 },
        backupCodeOptions: { amount: 10, length: 12, storeBackupCodes: "encrypted" },
      }),
    ],
  });
}

export function getAuth(origin?: string) {
  const url = origin || env.BETTER_AUTH_URL;
  let instance = authInstances.get(url);
  if (!instance) {
    instance = createBetterAuthInstance(url);
    authInstances.set(url, instance);
  }
  return instance;
}

export function getAuthFromHeaders(headers?: Headers) {
  if (!headers) return auth;
  const origin = resolveOriginFromHeaders(headers);
  return getAuth(origin);
}

export const auth = getAuth();
export type AuthSession = typeof auth.$Infer.Session;
