import { defineConfig, devices } from "@playwright/test";

const port = process.env.PLAYWRIGHT_PORT || "3000";
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL?.replace(/\/$/, "");
const baseURL = externalBaseURL || `http://127.0.0.1:${port}`;
const storageState = process.env.PLAYWRIGHT_STORAGE_STATE;

/**
 * Playwright E2E configuration.
 *
 * Public smoke tests cover landing, auth, legal, and help pages. The mutating
 * transaction journey creates its own owner and tenant and runs only against an
 * isolated local database with E2E_MUTATION_ALLOWED=true.
 *
 * Run: npm run e2e
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "html",
  use: {
    baseURL,
    trace: "on-first-retry",
    locale: "id-ID",
    ...(storageState ? { storageState } : {}),
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: externalBaseURL ? undefined : {
    command: `npx next dev --turbopack -H 127.0.0.1 --port ${port}`,
    url: baseURL,
    env: { ...process.env, NEXT_DIST_DIR: ".next-playwright" },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
