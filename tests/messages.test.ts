import { readFileSync, existsSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

function keysOf(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value) || typeof value !== "object" || value === null) return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    typeof child === "object" && child !== null && !Array.isArray(child)
      ? [`${prefix}${key}`, ...keysOf(child, `${prefix}${key}.`)]
      : [`${prefix}${key}`],
  );
}

test("id and en message trees have identical keys", () => {
  const id = JSON.parse(readFileSync(join(process.cwd(), "messages", "id.json"), "utf8"));
  const en = JSON.parse(readFileSync(join(process.cwd(), "messages", "en.json"), "utf8"));
  const idKeys = keysOf(id).sort();
  const enKeys = keysOf(en).sort();
  const missingInEn = idKeys.filter((key) => !enKeys.includes(key));
  const missingInId = enKeys.filter((key) => !idKeys.includes(key));
  assert.deepEqual(
    { missingInEn, missingInId },
    { missingInEn: [], missingInId: [] },
    "Translation keys must stay in sync between id.json and en.json",
  );
});

const translatedFiles: Array<[string, string]> = [
  ["components/kasir/settings/account-tab.tsx", "AccountTab"],
  ["components/kasir/settings/business-tab.tsx", "BusinessTab"],
  ["components/kasir/settings/branches-tab.tsx", "BranchesTab"],
  ["components/kasir/settings/businesses-tab.tsx", "BusinessesTab"],
  ["components/kasir/settings-page.tsx", "Settings"],
  ["components/kasir/pos-screen.tsx", "POS"],
  ["components/kasir/auth-layout.tsx", "AuthLayout"],
  ["components/app-sidebar.tsx", "Sidebar"],
  ["components/site-header.tsx", "Header"],
  ["components/nav-user.tsx", "NavUser"],
  ["components/self-order/self-order-flow.tsx", "SelfOrder"],
  ["app/[locale]/page.tsx", "Landing"],
  ["app/[locale]/sign-in/page.tsx", "SignIn"],
  ["app/[locale]/sign-up/page.tsx", "SignUp"],
  ["app/[locale]/onboarding/page.tsx", "Onboarding"],
];

test("every t() key used by translated components exists in both message files", () => {
  const id = JSON.parse(readFileSync(join(process.cwd(), "messages", "id.json"), "utf8")) as Record<string, Record<string, unknown>>;
  const en = JSON.parse(readFileSync(join(process.cwd(), "messages", "en.json"), "utf8")) as Record<string, Record<string, unknown>>;
  const missing: Array<{ file: string; key: string; locale: string }> = [];

  for (const [file, fallbackNamespace] of translatedFiles) {
    const path = join(process.cwd(), file);
    if (!existsSync(path)) continue;
    const source = readFileSync(path, "utf8");
    let namespace = fallbackNamespace;
    for (const line of source.split("\n")) {
      const nsMatch = line.match(/useTranslations\(\s*"([^"]+)"\s*\)/);
      if (nsMatch) namespace = nsMatch[1];
      for (const match of line.matchAll(/\bt\(\s*"([^"]+)"\s*\)/g)) {
        const key = match[1];
        if (!/^[A-Za-z][A-Za-z0-9]*$/.test(key)) continue; // skip split("x") false positives
        for (const [locale, messages] of [["id", id], ["en", en]] as const) {
          if (!(messages[namespace] && key in messages[namespace])) {
            missing.push({ file, key, locale });
          }
        }
      }
    }
  }

  assert.deepEqual(missing, [], "t() keys referenced in components must exist in both messages files");
});