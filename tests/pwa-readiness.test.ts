import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import manifest from "@/app/manifest";
import { buildReceiptEscPos } from "@/lib/services/escpos-printer";

const receipt = {
  storeName: "Kedai Uji",
  branchName: "Cabang Selatan",
  branchAddress: "Jl. Merdeka No. 1",
  orderNumber: "POS-0001",
  cashierName: "Siti",
  date: new Date("2026-09-02T08:00:00.000Z"),
  items: [
    { name: "Kopi Susu Gula Aren Ukuran Besar", quantity: 2, price: 18_000 },
    { name: "Roti Bakar", quantity: 1, price: 12_000, notes: "Tanpa keju" },
  ],
  subtotal: 48_000,
  discountAmount: 3_000,
  taxAmount: 4_950,
  total: 49_950,
  paymentMethod: "QRIS",
  verificationCode: "https://kedai-ku.example/receipt/verify-token",
};

void test("PWA manifest has standalone mode and installable PNG icons", async () => {
  const value = manifest();
  assert.equal(value.display, "standalone");
  assert.equal(value.start_url, "/dashboard");

  const icons = value.icons || [];
  assert.ok(icons.some((icon) => icon.sizes === "192x192" && icon.type === "image/png"));
  assert.ok(icons.some((icon) => icon.sizes === "512x512" && icon.type === "image/png"));
  assert.ok(icons.some((icon) => String(icon.purpose).includes("maskable")));

  for (const icon of icons) {
    const bytes = await readFile(`public${icon.src}`);
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  }
});

void test("service worker provides offline shell without caching API or auth responses", async () => {
  const worker = await readFile("public/sw.js", "utf8");
  assert.match(worker, /PRECACHE_URLS/);
  assert.match(worker, /\/manifest\.webmanifest/);
  assert.match(worker, /SYNC_PENDING_TRANSACTIONS/);
  assert.match(worker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(worker, /request\.method !== "GET"/);
});

void test("ESC/POS receipts support 58 mm, 80 mm, and QR verification", () => {
  const narrow = buildReceiptEscPos(receipt, 58);
  const wide = buildReceiptEscPos(receipt, 80);
  const narrowText = Buffer.from(narrow).toString("latin1");
  const wideText = Buffer.from(wide).toString("latin1");

  assert.ok(narrowText.includes("-".repeat(32)));
  assert.ok(wideText.includes("-".repeat(48)));
  assert.ok(narrowText.includes("KEDAI UJI"));
  assert.ok(narrowText.includes("Diskon"));
  assert.ok(narrowText.includes("TOTAL"));
  assert.ok(narrowText.includes("Verifikasi transaksi:"));
  // GS ( k ... 49 80 48 = store QR data, followed by GS ( k ... 49 81 48 = print.
  assert.ok(narrowText.includes("\x1d(k"));
  assert.ok(narrowText.includes("1P0"));
  assert.ok(narrowText.includes("1Q0"));
  // All printable receipt content is a single-byte code page; only ESC/POS
  // commands may contain bytes outside printable ASCII.
  assert.equal(narrowText.includes("ð"), false);
});
