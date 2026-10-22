import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { receivePurchaseSchema } from "@/lib/services/purchasing";
import { evaluatePromotionDiscount, type Promotion } from "@/lib/services/promotions";

describe("Feature Bug Fixes - Unit & Schema Verification", () => {
  describe("Bug 1: Goods Receipt (Penerimaan Barang) Schema", () => {
    it("should accept rejectedQuantity as 0 (number)", () => {
      const payload = {
        purchaseOrderId: crypto.randomUUID(),
        warehouseId: crypto.randomUUID(),
        items: [
          {
            purchaseOrderItemId: crypto.randomUUID(),
            variantId: crypto.randomUUID(),
            acceptedQuantity: 10,
            rejectedQuantity: 0,
            unitCostAmount: 50000,
          },
        ],
      };

      const parsed = receivePurchaseSchema.parse(payload);
      assert.equal(parsed.items[0].acceptedQuantity, 10n);
      assert.equal(parsed.items[0].rejectedQuantity, 0n);
      assert.equal(parsed.items[0].unitCostAmount, 50000n);
    });

    it("should accept rejectedQuantity as '0' (string)", () => {
      const payload = {
        purchaseOrderId: crypto.randomUUID(),
        warehouseId: crypto.randomUUID(),
        items: [
          {
            purchaseOrderItemId: crypto.randomUUID(),
            variantId: crypto.randomUUID(),
            acceptedQuantity: "5",
            rejectedQuantity: "0",
            unitCostAmount: "25000",
          },
        ],
      };

      const parsed = receivePurchaseSchema.parse(payload);
      assert.equal(parsed.items[0].acceptedQuantity, 5n);
      assert.equal(parsed.items[0].rejectedQuantity, 0n);
    });

    it("should default rejectedQuantity to 0n when omitted", () => {
      const payload = {
        purchaseOrderId: crypto.randomUUID(),
        warehouseId: crypto.randomUUID(),
        items: [
          {
            purchaseOrderItemId: crypto.randomUUID(),
            variantId: crypto.randomUUID(),
            acceptedQuantity: 12,
            unitCostAmount: 10000,
          },
        ],
      };

      const parsed = receivePurchaseSchema.parse(payload);
      assert.equal(parsed.items[0].rejectedQuantity, 0n);
    });

    it("should reject when acceptedQuantity is 0 (must be > 0)", () => {
      const payload = {
        purchaseOrderId: crypto.randomUUID(),
        warehouseId: crypto.randomUUID(),
        items: [
          {
            purchaseOrderItemId: crypto.randomUUID(),
            variantId: crypto.randomUUID(),
            acceptedQuantity: 0,
            rejectedQuantity: 5,
            unitCostAmount: 10000,
          },
        ],
      };

      assert.throws(() => receivePurchaseSchema.parse(payload));
    });
  });

  describe("Bug 2: Promotion Engine Discount Calculation", () => {
    const basePromo: Omit<Promotion, "type" | "percentageBps" | "valueAmount"> = {
      id: "promo-1",
      organizationId: "org-1",
      name: "Test Promo",
      code: "TEST",
      startsAt: new Date(Date.now() - 3600_000),
      endsAt: null,
      usageLimit: null,
      perCustomerLimit: null,
      usageCount: 0,
      isActive: true,
    };

    it("should calculate percentage discount for happy_hour type", () => {
      const promo: Promotion = {
        ...basePromo,
        type: "happy_hour",
        percentageBps: 2000, // 20%
        valueAmount: 0n,
      };

      // 20% of Rp 100.000 = Rp 20.000
      const discount = evaluatePromotionDiscount(promo, 100_000n);
      assert.equal(discount, 20_000n);
    });

    it("should calculate percentage discount for flash_sale type", () => {
      const promo: Promotion = {
        ...basePromo,
        type: "flash_sale",
        percentageBps: 5000, // 50%
        valueAmount: 0n,
      };

      // 50% of Rp 250.000 = Rp 125.000
      const discount = evaluatePromotionDiscount(promo, 250_000n);
      assert.equal(discount, 125_000n);
    });

    it("should calculate fixed discount for birthday type", () => {
      const promo: Promotion = {
        ...basePromo,
        type: "birthday",
        percentageBps: 0,
        valueAmount: 35_000n, // Potongan Rp 35.000
      };

      const discount = evaluatePromotionDiscount(promo, 100_000n);
      assert.equal(discount, 35_000n);
    });

    it("should cap fixed birthday discount at taxable amount", () => {
      const promo: Promotion = {
        ...basePromo,
        type: "birthday",
        percentageBps: 0,
        valueAmount: 50_000n,
      };

      // Order total is only Rp 30.000, discount should cap at Rp 30.000
      const discount = evaluatePromotionDiscount(promo, 30_000n);
      assert.equal(discount, 30_000n);
    });

    it("should use dynamic fallback if a custom type has percentageBps configured", () => {
      const promo: Promotion = {
        ...basePromo,
        type: "bundle",
        percentageBps: 1500, // 15%
        valueAmount: 0n,
      };

      const discount = evaluatePromotionDiscount(promo, 200_000n);
      assert.equal(discount, 30_000n);
    });

    it("should return 0n if taxable amount is 0 or negative", () => {
      const promo: Promotion = {
        ...basePromo,
        type: "happy_hour",
        percentageBps: 2000,
        valueAmount: 0n,
      };

      assert.equal(evaluatePromotionDiscount(promo, 0n), 0n);
      assert.equal(evaluatePromotionDiscount(promo, -5000n), 0n);
    });
  });
});
