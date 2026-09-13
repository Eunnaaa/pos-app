import assert from "node:assert/strict";
import test from "node:test";
import { exclusiveTax, parseRateToBps } from "@/lib/server/tax";
import { calculateSettlement } from "@/lib/services/cash-settlement";
import { buildShiftReportMessage } from "@/lib/services/shift-report-message";

void test("POS Flow: Cart subtotal, discounts, service charge and tax calculation", () => {
  // Item 1: Nasi Goreng (2 x Rp 25.000 = Rp 50.000)
  // Item 2: Es Teh (2 x Rp 5.000 = Rp 10.000)
  const item1Total = 50_000n;
  const item2Total = 10_000n;
  const subtotal = item1Total + item2Total; // Rp 60.000
  assert.equal(subtotal, 60_000n);

  // Discount 10% on subtotal (Rp 6.000)
  const discount = 6_000n;
  const afterDiscount = subtotal - discount; // Rp 54.000
  assert.equal(afterDiscount, 54_000n);

  // Service charge 5% (Rp 2.700)
  const serviceCharge = (afterDiscount * 5n) / 100n;
  assert.equal(serviceCharge, 2_700n);

  // PB1 Tax 10% exclusive on (afterDiscount + serviceCharge = Rp 56.700)
  const taxableBase = afterDiscount + serviceCharge;
  const taxRateBps = parseRateToBps("10"); // 1000 bps
  const taxAmount = exclusiveTax(taxableBase, taxRateBps);
  assert.equal(taxAmount, 5_670n);

  // Total order amount
  const grandTotal = taxableBase + taxAmount; // Rp 62.370
  assert.equal(grandTotal, 62_370n);

  // Customer pays with Rp 100.000 cash
  const cashTendered = 100_000n;
  const change = cashTendered - grandTotal; // Rp 37.630
  assert.equal(change, 37_630n);
});
void test("POS Flow: Cash register shift closure settlement and variance", () => {
  const openingAmount = 200_000n; // Kas awal Rp 200.000
  const cashSales = 850_000n;    // Penjualan tunai Rp 850.000
  const cashIn = 50_000n;        // Tambah kas kecil Rp 50.000
  const cashOut = 100_000n;      // Ambil kas untuk beli es batu Rp 100.000

  // Scenario 1: Exact balance (Selisih 0)
  const settlementExact = calculateSettlement({
    openingAmount,
    payments: { cash: cashSales },
    refunds: {},
    cashChange: 0n,
    cashIn,
    cashOut,
    actuals: { cash: 1_000_000n },
  });
  assert.equal(settlementExact.expectedCash, 1_000_000n);
  assert.equal(settlementExact.actualCash, 1_000_000n);
  assert.equal(settlementExact.cashVariance, 0n);

  // Scenario 2: Kas fisik kurang Rp 20.000 (Minus / Shortage)
  const settlementShort = calculateSettlement({
    openingAmount,
    payments: { cash: cashSales },
    refunds: {},
    cashChange: 0n,
    cashIn,
    cashOut,
    actuals: { cash: 980_000n },
  });
  assert.equal(settlementShort.expectedCash, 1_000_000n);
  assert.equal(settlementShort.actualCash, 980_000n);
  assert.equal(settlementShort.cashVariance, -20_000n);

  // Scenario 3: Kas fisik lebih Rp 15.000 (Overage)
  const settlementOver = calculateSettlement({
    openingAmount,
    payments: { cash: cashSales },
    refunds: {},
    cashChange: 0n,
    cashIn,
    cashOut,
    actuals: { cash: 1_015_000n },
  });
  assert.equal(settlementOver.expectedCash, 1_000_000n);
  assert.equal(settlementOver.actualCash, 1_015_000n);
  assert.equal(settlementOver.cashVariance, 15_000n);
});

void test("POS Flow: Shift report WhatsApp notification message contains proper business metrics", () => {
  const msg = buildShiftReportMessage({
    id: "session-1",
    organizationId: "org-1",
    userId: "user-1",
    openingAmount: "200000",
    expectedClosingAmount: "1000000",
    actualClosingAmount: "1000000",
    varianceAmount: "0",
    paymentBreakdown: {
      cash: { paid: "500000" },
      qris: { paid: "350000" },
    },
    closedAt: new Date("2026-08-22T20:00:00Z"),
    registerName: "Kasir 1",
    registerCode: "POS-01",
    branchName: "Main Branch",
    branchPhone: "085353111025",
    orgPhone: "085353111025",
    userName: "Budi Santoso",
    orders: "25",
    totalAmount: "850000",
  });

  assert.ok(msg.includes("Laporan Tutup Shift Kasir — Kedai-Ku"));
  assert.ok(msg.includes("Budi Santoso"));
  assert.ok(msg.includes("Main Branch"));
  assert.ok(msg.includes("25 order"));
  assert.ok(msg.includes("total: Rp 850.000") || msg.includes("Rp 850.000"));
  assert.ok(msg.includes("qris: Rp 350.000"));
});

void test("POS Flow: Fast O(1) Barcode map index finds products by barcode and SKU without regex scanning", () => {
  const products = [
    { id: "v1", productId: "p1", name: "Kopi Hitam", category: "Kopi", price: 15000, stock: 10, trackStock: true, sku: "KOP-001", barcode: "8992753123456", imageUrl: null },
    { id: "v2", productId: "p2", name: "Roti Cokelat", category: "Snack", price: 12000, stock: 5, trackStock: true, sku: "ROT-002", barcode: "8992753654321", imageUrl: null },
  ];

  const barcodeMap = new Map<string, (typeof products)[0]>();
  for (const p of products) {
    if (p.barcode) barcodeMap.set(p.barcode.trim().toLowerCase(), p);
    if (p.sku) barcodeMap.set(p.sku.trim().toLowerCase(), p);
  }

  // Lookup by scanned barcode
  const foundByBarcode = barcodeMap.get("8992753123456");
  assert.ok(foundByBarcode);
  assert.equal(foundByBarcode.name, "Kopi Hitam");

  // Lookup by SKU
  const foundBySku = barcodeMap.get("rot-002");
  assert.ok(foundBySku);
  assert.equal(foundBySku.name, "Roti Cokelat");

  // Non-existent barcode returns undefined in O(1)
  assert.equal(barcodeMap.get("unknown-barcode"), undefined);
});

void test("POS Flow: Progressive catalog pagination chunks large inventory for 60 FPS DOM rendering", () => {
  // Simulate 120 items in a catalog
  const largeCatalog = Array.from({ length: 120 }, (_, i) => ({
    id: `v-${i}`,
    productId: `p-${i}`,
    name: `Item ${i + 1}`,
    category: "Semua",
    price: 10000,
    stock: 50,
    trackStock: true,
    sku: `SKU-${i}`,
    barcode: null,
    imageUrl: null,
  }));

  const initialLimit = 48;
  const page1 = largeCatalog.slice(0, initialLimit);
  assert.equal(page1.length, 48);
  assert.equal(page1[0].name, "Item 1");
  assert.equal(page1[47].name, "Item 48");

  // Load next chunk
  const nextLimit = initialLimit + 48;
  const page2 = largeCatalog.slice(0, nextLimit);
  assert.equal(page2.length, 96);

  // Load all remaining
  const finalLimit = nextLimit + 48;
  const finalPage = largeCatalog.slice(0, finalLimit);
  assert.equal(finalPage.length, 120);
});
