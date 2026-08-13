/**
 * Next.js instrumentation hook — runs once on server startup.
 *
 * If SENTRY_DSN is set and @sentry/nextjs is installed, initializes Sentry
 * for automatic error capture and performance monitoring.
 *
 * To activate: `npm install @sentry/nextjs` and set `SENTRY_DSN` in .env
 *
 * NOTE: The dynamic import uses `new Function` so that the bundler (Turbopack/
 * webpack) cannot statically resolve `@sentry/nextjs` at build time. This lets
 * the package remain an optional dependency — the build succeeds without it.
 */

// A runtime-only import that bundlers cannot statically analyze.
const optionalImport = new Function(
  "specifier",
  "return import(specifier)",
) as (specifier: string) => Promise<Record<string, unknown>>;

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  try {
    const Sentry = (await optionalImport("@sentry/nextjs")) as {
      init: (config: Record<string, unknown>) => void;
    };
    Sentry.init({
      dsn,
      tracesSampleRate: 0.1,
      profilesSampleRate: 0.1,
      environment: process.env.NODE_ENV,
      beforeSend(event: Record<string, unknown>) {
        const request = event.request as { headers?: Record<string, string> } | undefined;
        if (request?.headers) {
          const headers = { ...request.headers };
          for (const key of Object.keys(headers)) {
            const lower = key.toLowerCase();
            if (["authorization", "cookie", "x-api-key"].includes(lower)) {
              headers[key] = "[redacted]";
            }
          }
          request.headers = headers;
        }
        return event;
      },
    });
    console.log("[sentry] initialized");
  } catch {
    console.warn("[sentry] SENTRY_DSN set but @sentry/nextjs not installed; run: npm install @sentry/nextjs");
  }
}
