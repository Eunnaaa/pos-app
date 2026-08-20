import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, twoFactor } from "better-auth/plugins";
import { getServerEnv, getTrustedOrigins } from "@/config/env";
import { db } from "@/db";
import { account, session, twoFactor as twoFactorTable, user, verification } from "@/db/schema";
import { sendEmail } from "@/lib/integrations/notifications";

const env = getServerEnv();
const isProduction = env.NODE_ENV === "production";
const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
const appleEnabled = Boolean(env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET);
const emailEnabled = Boolean(env.EMAIL_API_URL && env.EMAIL_API_KEY);

export const auth = betterAuth({
  appName: "Kasir-Ku",
  baseURL: env.BETTER_AUTH_URL,
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
  trustedOrigins: getTrustedOrigins(env),
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
              "Verifikasi Email — Kasir-Ku",
              `<p>Terima kasih telah mendaftar di Kasir-Ku.</p><p>Klik tautan berikut untuk memverifikasi alamat email Anda:</p><p><a href="${url}" style="display:inline-block;padding:10px 20px;background:#059669;color:#fff;border-radius:6px;text-decoration:none;">Verifikasi Email</a></p><p>Atau salin tautan ini ke browser Anda:<br/>${url}</p><p>Jika Anda tidak mendaftar di Kasir-Ku, abaikan email ini.</p>`,
            );
          },
          sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
            await sendEmail(
              user.email,
              "Reset Password — Kasir-Ku",
              `<p>Kami menerima permintaan untuk mereset password akun Kasir-Ku Anda.</p><p>Klik tautan berikut untuk mengatur password baru:</p><p><a href="${url}" style="display:inline-block;padding:10px 20px;background:#059669;color:#fff;border-radius:6px;text-decoration:none;">Reset Password</a></p><p>Atau salin tautan ini ke browser Anda:<br/>${url}</p><p>Jika Anda tidak meminta reset password, abaikan email ini.</p>`,
            );
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
            sendChangeEmailVerification: async ({ newEmail, url }) => {
              await sendEmail(
                newEmail,
                "Konfirmasi Email Baru — Kasir-Ku",
                `<p>Kami menerima permintaan untuk mengubah email akun Kasir-Ku Anda menjadi <strong>${newEmail}</strong>.</p><p>Klik tautan berikut untuk mengonfirmasi perubahan email:</p><p><a href="${url}" style="display:inline-block;padding:10px 20px;background:#059669;color:#fff;border-radius:6px;text-decoration:none;">Konfirmasi Email Baru</a></p><p>Atau salin tautan ini ke browser Anda:<br/>${url}</p><p>Jika Anda tidak meminta perubahan ini, abaikan email ini.</p>`,
              );
            },
          },
        }
      : {}),
  },
  session: {
    expiresIn: 60 * 60 * 12,
    updateAge: 60 * 15,
    freshAge: 60 * 10,
    cookieCache: { enabled: true, maxAge: 60 * 2 },
  },
  rateLimit: {
    enabled: true,
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
    useSecureCookies: isProduction,
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
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
      issuer: "Kasir-Ku",
      totpOptions: { period: 30, digits: 6 },
      backupCodeOptions: { amount: 10, length: 12, storeBackupCodes: "encrypted" },
    }),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
