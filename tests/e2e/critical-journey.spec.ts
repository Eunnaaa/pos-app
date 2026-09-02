import { expect, test, type Page } from "@playwright/test";

const enabled = process.env.CRITICAL_JOURNEY_SMOKE === "true";
const hasAuthenticatedState = Boolean(process.env.PLAYWRIGHT_STORAGE_STATE);

async function expectHealthyAuthenticatedPage(page: Page, path: string) {
  const serverErrors: string[] = [];
  const onResponse = (response: { status(): number; url(): string }) => {
    if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`);
  };
  page.on("response", onResponse);

  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page).not.toHaveURL(/\/sign-in(?:\?|$)/);
  await expect(page.locator("body")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/internal server error|application error/i);

  page.off("response", onResponse);
  expect(serverErrors, `Server errors while loading ${path}`).toEqual([]);
}

test.describe("authenticated critical-journey preflight", () => {
  test.skip(!enabled, "Set CRITICAL_JOURNEY_SMOKE=true to run against an isolated staging tenant");
  test.skip(!hasAuthenticatedState, "Set PLAYWRIGHT_STORAGE_STATE to an authenticated owner state file");

  test("owner, purchasing, and master-data surfaces load", async ({ page }) => {
    for (const path of [
      "/dashboard",
      "/dashboard/products",
      "/dashboard/inventory",
      "/dashboard/suppliers",
      "/dashboard/purchases",
    ]) await test.step(path, () => expectHealthyAuthenticatedPage(page, path));
  });

  test("POS, self-order, and kitchen surfaces load", async ({ page }) => {
    for (const path of [
      "/dashboard/pos",
      "/dashboard/sales",
      "/dashboard/self-order",
      "/dashboard/kitchen",
    ]) await test.step(path, () => expectHealthyAuthenticatedPage(page, path));
  });

  test("CRM, finance, and reporting surfaces load", async ({ page }) => {
    for (const path of [
      "/dashboard/customers",
      "/dashboard/loyalty",
      "/dashboard/finance",
      "/dashboard/reports",
    ]) await test.step(path, () => expectHealthyAuthenticatedPage(page, path));
  });
});
