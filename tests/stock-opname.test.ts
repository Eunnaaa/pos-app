import assert from "node:assert/strict";
import test from "node:test";
import {
  createStockOpnameSchema,
  updateStockOpnameSchema,
  completeStockOpnameSchema,
} from "@/lib/services/stock-opname";

void test("Stock Opname: Variance calculation logic accurately detects shortages, overages, and matches", () => {
  const items = [
    { name: "Kopi Arabika 250g", costAmount: 35_000n, expectedQty: 20n, countedQty: 18n }, // Shortage: -2 (Loss: -70.000)
    { name: "Susu UHT 1L", costAmount: 18_000n, expectedQty: 50n, countedQty: 50n },      // Match: 0 (Loss: 0)
    { name: "Sirup Karamel 750ml", costAmount: 85_000n, expectedQty: 5n, countedQty: 7n }, // Overage: +2 (Gain: +170.000)
    { name: "Gula Aren 1kg", costAmount: 22_000n, expectedQty: 15n, countedQty: 12n },     // Shortage: -3 (Loss: -66.000)
  ];

  let totalVarianceQty = 0n;
  let totalVarianceValue = 0n;
  let matchedCount = 0;
  let shortageCount = 0;
  let overageCount = 0;

  for (const item of items) {
    const variance = item.countedQty - item.expectedQty;
    const valueImpact = variance * item.costAmount;
    totalVarianceQty += variance;
    totalVarianceValue += valueImpact;

    if (variance === 0n) matchedCount++;
    else if (variance < 0n) shortageCount++;
    else overageCount++;
  }

  assert.equal(matchedCount, 1);
  assert.equal(shortageCount, 2);
  assert.equal(overageCount, 1);
  assert.equal(totalVarianceQty, -3n); // -2 + 0 + 2 - 3 = -3 unit
  assert.equal(totalVarianceValue, 34_000n); // -70.000 + 170.000 - 66.000 = +34.000
});

void test("Stock Opname: Zod schemas enforce strict UUIDs and non-negative quantities", () => {
  const validWarehouseId = "11111111-1111-4111-8111-111111111111";
  const validVariantId = "22222222-2222-4222-8222-222222222222";

  // Valid creation input
  const validCreate = createStockOpnameSchema.safeParse({
    warehouseId: validWarehouseId,
    notes: "Opname Bulanan",
  });
  assert.equal(validCreate.success, true);

  // Invalid creation input (invalid UUID)
  const invalidCreate = createStockOpnameSchema.safeParse({
    warehouseId: "invalid-uuid",
  });
  assert.equal(invalidCreate.success, false);

  // Valid update input
  const validUpdate = updateStockOpnameSchema.safeParse({
    notes: "Progress shift 1",
    items: [
      {
        variantId: validVariantId,
        countedQuantity: "15",
        reason: "Barang rusak 2 pcs",
      },
    ],
  });
  assert.equal(validUpdate.success, true);
  if (validUpdate.success) {
    assert.equal(validUpdate.data.items[0].countedQuantity, 15n);
  }

  // Invalid update input (negative quantity)
  const invalidUpdate = updateStockOpnameSchema.safeParse({
    items: [
      {
        variantId: validVariantId,
        countedQuantity: -5,
      },
    ],
  });
  assert.equal(invalidUpdate.success, false);

  // Valid completion input
  const validComplete = completeStockOpnameSchema.safeParse({
    notes: "Selesai diinspeksi oleh Manager",
  });
  assert.equal(validComplete.success, true);
});
