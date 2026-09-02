import { expect, test } from "@playwright/test";

test("PWA production resources are valid and cache-safe", async ({ request }) => {
  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = await manifestResponse.json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ sizes: "192x192", type: "image/png" }),
    expect.objectContaining({ sizes: "512x512", type: "image/png" }),
  ]));

  for (const icon of manifest.icons) {
    const response = await request.get(icon.src);
    expect(response.ok()).toBeTruthy();
    expect(response.headers()["content-type"]).toContain("image/png");
  }

  const workerResponse = await request.get("/sw.js");
  expect(workerResponse.ok()).toBeTruthy();
  expect(workerResponse.headers()["content-type"]).toContain("javascript");
  expect(await workerResponse.text()).toContain("SYNC_PENDING_TRANSACTIONS");
});

test("offline navigation renders the offline fallback after worker install", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "Offline service-worker validation is Chromium-only");
  test.skip(process.env.PWA_PRODUCTION_SMOKE !== "true", "Run against a production build with PWA_PRODUCTION_SMOKE=true");

  await page.goto("/offline");
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    await registration.update();
  });
  await page.reload();
  await context.setOffline(true);
  await page.goto("/a-route-that-is-not-cached");
  await expect(page.getByRole("heading", { name: /anda sedang offline/i })).toBeVisible();
  await context.setOffline(false);
});
