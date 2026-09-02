/**
 * Next.js instrumentation hook — runs once on server startup.
 *
 * If SENTRY_DSN is set and @sentry/nextjs is installed, initializes Sentry
 * for automatic error capture and performance monitoring.
 *
 * To activate: `npm install @sentry/nextjs` and set `SENTRY_DSN` in .env
 */
import { scrubSentryEvent } from "@/lib/observability/scrub";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  // Dynamic import to keep @sentry/nextjs optional; only runs in Node.js runtime
  const optionalImport = new Function(
    "specifier",
    "return import(specifier)",
  ) as (specifier: string) => Promise<Record<string, unknown>>;

  try {
    const Sentry = (await optionalImport("@sentry/nextjs")) as {
      init: (config: Record<string, unknown>) => void;
    };
    Sentry.init({
      dsn,
      tracesSampleRate: 0.1,
      profilesSampleRate: 0.1,
      environment: process.env.NODE_ENV,
      sendDefaultPii: false,
      dataCollection: { userInfo: false, httpBodies: [] },
      beforeSend: scrubSentryEvent,
      beforeBreadcrumb: scrubSentryEvent,
    });
    console.log("[sentry] initialized");
  } catch {
    console.warn("[sentry] SENTRY_DSN set but @sentry/nextjs not installed; run: npm install @sentry/nextjs");
  }
}
