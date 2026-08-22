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
  assert.ok(msg.includes("Rp 850.000"));
  assert.ok(msg.includes("qris: Rp 350.000"));
});
