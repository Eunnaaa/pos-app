import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@/db";
import { promotions, vouchers, orderPromotions } from "@/db/schema";
import { AppError } from "@/lib/server";

type Promotion = {
  id: string;
  organizationId: string;
  name: string;
  code: string | null;
  type: "percentage" | "fixed" | "buy_x_get_y" | "bundle" | "cashback" | "happy_hour" | "flash_sale" | "birthday";
  valueAmount: bigint;
  percentageBps: number;
  startsAt: Date;
  endsAt: Date | null;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  usageCount: number;
  isActive: boolean;
};

type Voucher = {
  id: string;
  organizationId: string;
  customerId: string | null;
  promotionId: string | null;
  code: string;
  initialAmount: bigint;
  remainingAmount: bigint;
  status: "active" | "redeemed" | "expired" | "cancelled";
  expiresAt: Date | null;
};

export type ResolvedDiscount = {
  promotionId?: string;
  voucherId?: string;
  code: string;
  discountAmount: bigint;
  /** Internal: the resolved promotion or voucher row for later recording. */
  _kind: "promotion" | "voucher";
  _rowId: string;
};

/**
 * Compute the discount for a promotion given the taxable amount (subtotal after item discounts).
 * Supports percentage and fixed types. Other types (buy_x_get_y, bundle, etc.) return 0 for now
 * and can be extended incrementally.
 */
export function evaluatePromotionDiscount(promotion: Promotion, taxableAmount: bigint): bigint {
  if (taxableAmount <= 0n) return 0n;
  switch (promotion.type) {
    case "percentage": {
      if (promotion.percentageBps <= 0) return 0n;
      const discount = (taxableAmount * BigInt(promotion.percentageBps)) / 10000n;
      return discount > taxableAmount ? taxableAmount : discount;
    }
    case "fixed": {
      return promotion.valueAmount > taxableAmount ? taxableAmount : promotion.valueAmount;
    }
    default:
      return 0n;
  }
}

/** Compute the discount for a voucher: the remaining amount, capped at the taxable amount. */
export function evaluateVoucherDiscount(voucher: Voucher, taxableAmount: bigint): bigint {
  if (taxableAmount <= 0n) return 0n;
  return voucher.remainingAmount > taxableAmount ? taxableAmount : voucher.remainingAmount;
}

function assertPromotionValid(promotion: Promotion, now: Date): void {
  if (!promotion.isActive) throw new AppError("BAD_REQUEST", "Promo tidak aktif");
  if (promotion.startsAt > now) throw new AppError("BAD_REQUEST", "Promo belum berlaku");
  if (promotion.endsAt && promotion.endsAt < now) throw new AppError("BAD_REQUEST", "Promo sudah berakhir");
  if (promotion.usageLimit !== null && promotion.usageCount >= promotion.usageLimit) {
    throw new AppError("CONFLICT", "Kuota promo sudah habis");
  }
}

function assertVoucherValid(voucher: Voucher, now: Date, customerId?: string): void {
  if (voucher.status !== "active") throw new AppError("BAD_REQUEST", "Voucher tidak aktif");
  if (voucher.expiresAt && voucher.expiresAt < now) throw new AppError("BAD_REQUEST", "Voucher sudah kedaluwarsa");
  if (voucher.remainingAmount <= 0n) throw new AppError("BAD_REQUEST", "Saldo voucher habis");
  if (customerId && voucher.customerId && voucher.customerId !== customerId) {
    throw new AppError("FORBIDDEN", "Voucher ini bukan milik pelanggan tersebut");
  }
}

/**
 * Resolve promotions/vouchers for a checkout (read-only). Returns the total discount and
 * resolved records. Use {@link recordPromotions} after the order is inserted to persist
 * order_promotions rows and update usage counters.
 */
export async function resolvePromotionDiscount(tx: Database, params: {
  organizationId: string;
  taxableAmount: bigint;
  promotionCode?: string;
  voucherCode?: string;
  customerId?: string;
}): Promise<{ totalDiscount: bigint; records: ResolvedDiscount[] }> {
  const now = new Date();
  const records: ResolvedDiscount[] = [];
  let totalDiscount = 0n;

  if (params.promotionCode) {
    const [promotion] = await tx.select().from(promotions).where(and(
      eq(promotions.organizationId, params.organizationId),
      eq(promotions.code, params.promotionCode),
    )).limit(1);
    if (!promotion) throw new AppError("NOT_FOUND", "Kode promo tidak ditemukan");
    assertPromotionValid(promotion as unknown as Promotion, now);
    const discount = evaluatePromotionDiscount(promotion as unknown as Promotion, params.taxableAmount);
    if (discount > 0n) {
      totalDiscount += discount;
      records.push({ promotionId: promotion.id, code: params.promotionCode, discountAmount: discount, _kind: "promotion", _rowId: promotion.id });
    }
  }

  if (params.voucherCode) {
    const [voucher] = await tx.select().from(vouchers).where(and(
      eq(vouchers.organizationId, params.organizationId),
      eq(vouchers.code, params.voucherCode),
    )).limit(1);
    if (!voucher) throw new AppError("NOT_FOUND", "Voucher tidak ditemukan");
    assertVoucherValid(voucher as unknown as Voucher, now, params.customerId);
    const remainingTaxable = params.taxableAmount - totalDiscount;
    if (remainingTaxable > 0n) {
      const discount = evaluateVoucherDiscount(voucher as unknown as Voucher, remainingTaxable);
      if (discount > 0n) {
        totalDiscount += discount;
        records.push({ voucherId: voucher.id, code: params.voucherCode, discountAmount: discount, _kind: "voucher", _rowId: voucher.id });
      }
    }
  }

  return { totalDiscount, records };
}

/**
 * Persist order_promotions rows and update voucher/promotion usage counters.
 * Must be called after the order is inserted (orderId is required for the FK).
 */
export async function recordPromotions(tx: Database, params: {
  organizationId: string;
  orderId: string;
  records: ResolvedDiscount[];
}): Promise<void> {
  const now = new Date();
  for (const record of params.records) {
    await tx.insert(orderPromotions).values({
      organizationId: params.organizationId,
      orderId: params.orderId,
      promotionId: record.promotionId ?? null,
      code: record.code,
      discountAmount: record.discountAmount,
    });
    if (record._kind === "promotion") {
      await tx.update(promotions).set({ usageCount: sql`${promotions.usageCount} + 1`, updatedAt: now }).where(eq(promotions.id, record._rowId));
    } else {
      // Decrement voucher remaining amount and mark redeemed if exhausted
      const [voucher] = await tx.select({ remaining: vouchers.remainingAmount }).from(vouchers).where(eq(vouchers.id, record._rowId)).limit(1);
      if (voucher) {
        const newRemaining = voucher.remaining - record.discountAmount;
        await tx.update(vouchers).set({
          remainingAmount: newRemaining,
          status: newRemaining <= 0n ? "redeemed" : "active",
          updatedAt: now,
        }).where(eq(vouchers.id, record._rowId));
      }
    }
  }
}
