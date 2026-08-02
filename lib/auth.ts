import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, twoFactor } from "better-auth/plugins";
import { getServerEnv, getTrustedOrigins } from "@/config/env";
import { db } from "@/db";
import { account, session, twoFactor as twoFactorTable, user, verification } from "@/db/schema";

const env = getServerEnv();
const isProduction = env.NODE_ENV === "production";
const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
const appleEnabled = Boolean(env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET);

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
