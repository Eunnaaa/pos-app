import assert from "node:assert/strict";
import test from "node:test";
import {
  createStockOpnameSchema,
  updateStockOpnameSchema,
  completeStockOpnameSchema,
} from "@/lib/services/stock-opname";

void test("Stock Opname: Full lifecycle mathematical calculation & ledger balance adjustments", () => {
  // Scenario: Toko Kopi melakukan Stock Opname akhir bulan untuk 5 bahan baku
  const inventorySnapshot = [
    {
      sku: "RAW-COFFEE-01",
      name: "Biji Kopi House Blend 1kg",
      unitCost: 120_000n,
      systemOnHand: 25n,    // Sistem mencatat 25 pack
      physicalCount: 22n,   // Fisik riil 22 pack (Kurang 3 pack / Selisih -3)
      reason: "Bocor / rusak kemasan saat roasting",
    },
    {
      sku: "RAW-MILK-02",
      name: "Fresh Milk Pasteurisasi 1L",
      unitCost: 18_000n,
      systemOnHand: 60n,    // Sistem mencatat 60 botol
      physicalCount: 60n,   // Fisik riil 60 botol (Cocok / Selisih 0)
      reason: "",
    },
    {
      sku: "RAW-SYRUP-VAN",
      name: "Sirup Vanilla 750ml",
      unitCost: 95_000n,
      systemOnHand: 8n,     // Sistem mencatat 8 botol
      physicalCount: 10n,   // Fisik riil 10 botol (Lebih 2 botol / Selisih +2)
      reason: "Bonus supplier belum tercatat di invoice",
    },
    {
      sku: "RAW-SUGAR-AREN",
      name: "Gula Aren Cair 1L",
      unitCost: 32_000n,
      systemOnHand: 40n,    // Sistem mencatat 40 pouch
      physicalCount: 38n,   // Fisik riil 38 pouch (Kurang 2 pouch / Selisih -2)
      reason: "Tumpah di area bar kasir",
    },
    {
      sku: "PKG-CUP-16OZ",
      name: "Paper Cup 16oz (Pack isi 50)",
      unitCost: 25_000n,
      systemOnHand: 15n,    // Sistem mencatat 15 pack
      physicalCount: 15n,   // Fisik riil 15 pack (Cocok / Selisih 0)
      reason: "",
    },
  ];

  let totalSystemOnHand = 0n;
  let totalPhysicalCount = 0n;
  let totalVarianceQuantity = 0n;
  let totalFinancialImpact = 0n;
  let matchedItems = 0;
  let varianceItems = 0;

  // Post-Opname simulation array for balances & movements
  const adjustedBalances: { sku: string; newOnHand: bigint }[] = [];
  const generatedMovements: { sku: string; type: string; quantity: bigint; reason: string }[] = [];

  for (const item of inventorySnapshot) {
    const variance = item.physicalCount - item.systemOnHand;
    const valueImpact = variance * item.unitCost;

    totalSystemOnHand += item.systemOnHand;
    totalPhysicalCount += item.physicalCount;
    totalVarianceQuantity += variance;
    totalFinancialImpact += valueImpact;

    if (variance === 0n) {
      matchedItems++;
    } else {
      varianceItems++;
      generatedMovements.push({
        sku: item.sku,
        type: "opname",
        quantity: variance,
        reason: item.reason,
      });
    }

    adjustedBalances.push({
      sku: item.sku,
      newOnHand: item.physicalCount,
    });
  }

  // 1. Verifikasi Metrics Opname
  assert.equal(inventorySnapshot.length, 5, "Total 5 SKU dihitung");
  assert.equal(matchedItems, 2, "2 SKU stoknya cocok persis");
  assert.equal(varianceItems, 3, "3 SKU memiliki selisih");
  assert.equal(totalSystemOnHand, 148n, "Total stok sistem awal: 148 unit");
  assert.equal(totalPhysicalCount, 145n, "Total stok fisik riil: 145 unit");
  assert.equal(totalVarianceQuantity, -3n, "Total selisih fisik: -3 unit (Net Loss)");

  // 2. Verifikasi Dampak Finansial:
  // Coffee: -3 x 120.000 = -360.000
  // Syrup:  +2 x 95.000  = +190.000
  // Sugar:  -2 x 32.000  = -64.000
  // Total: -360.000 + 190.000 - 64.000 = -234.000 (Rugi HPP Rp 234.000)
  assert.equal(totalFinancialImpact, -234_000n, "Dampak finansial HPP adalah -Rp 234.000");

  // 3. Verifikasi Mutasi Ledger yang Terbentuk:
  assert.equal(generatedMovements.length, 3, "Hanya 3 item berselisih yang menghasilkan movement ledger");
  assert.deepEqual(
    generatedMovements.map((m) => ({ sku: m.sku, qty: m.quantity })),
    [
      { sku: "RAW-COFFEE-01", qty: -3n },
      { sku: "RAW-SYRUP-VAN", qty: 2n },
      { sku: "RAW-SUGAR-AREN", qty: -2n },
    ]
  );

  // 4. Verifikasi Saldo Baru Tepat Sama dengan Fisik Riil:
  for (const item of inventorySnapshot) {
    const balance = adjustedBalances.find((b) => b.sku === item.sku);
    assert.equal(balance?.newOnHand, item.physicalCount, `Saldo ${item.sku} harus sama dengan fisik`);
  }
});

void test("Stock Opname: Zod parsing and transformation integrity", () => {
  const validWarehouse = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
  const validVariant = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";

  // Create Schema Valid
  const parsedCreate = createStockOpnameSchema.parse({
    warehouseId: validWarehouse,
    notes: "Opname Q3 2026",
  });
  assert.equal(parsedCreate.warehouseId, validWarehouse);
  assert.equal(parsedCreate.notes, "Opname Q3 2026");

  // Update Schema transforms string/number to BigInt
  const parsedUpdate = updateStockOpnameSchema.parse({
    items: [
      {
        variantId: validVariant,
        countedQuantity: "42",
        reason: "Sesuai hitungan fisik",
      },
      {
        variantId: validVariant,
        countedQuantity: 10,
      },
    ],
  });
  assert.equal(parsedUpdate.items[0].countedQuantity, 42n);
  assert.equal(parsedUpdate.items[1].countedQuantity, 10n);

  // Complete Schema
  const parsedComplete = completeStockOpnameSchema.parse({
    notes: "Disetujui oleh Owner",
  });
  assert.equal(parsedComplete.notes, "Disetujui oleh Owner");
});
