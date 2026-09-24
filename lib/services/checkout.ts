import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Database } from "@/db";
import {
  cashRegisters,
  cashRegisterSessions,
  branches,
  customers,
  diningTables,
  kitchenTickets,
  kitchenTicketItems,
  loyaltyAccounts,
  loyaltyTransactions,
  productVariants,
  products,
  receipts,
  taxRates,
  warehouses,
  salesOrderItems,
  salesOrders,
  salesPayments,
} from "@/db/schema";
import type { ApiContext } from "@/lib/api";
import { assertPeriodOpen, AppError } from "@/lib/server";
import { assertCanCreateOrder } from "./subscription";
import { postStockMovement } from "./stock-ledger";
import { reserveOrderStock } from "./stock-reservations";
import { ONLINE_RESERVATION_MS } from "@/lib/online-reservation-policy";
import { postSaleToLedger } from "./ledger";
import { allocateDiscount, exclusiveTax, inclusiveTax, parseRateToBps } from "@/lib/server/tax";
import { resolvePromotionDiscount, recordPromotions } from "./promotions";
import { accrueCommission } from "./commissions";
import { publishEvent, cacheDel, RedisKeys } from "@/lib/redis";

const bigintInput = z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative().safe()]).transform(BigInt);
const positiveBigint = bigintInput.refine((value) => value > 0n, "Must be greater than zero");

export const checkoutSchema = z.object({
  branchId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  cashSessionId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  type: z.enum(["sale", "quotation", "invoice"]).default("sale"),
  status: z.enum(["draft", "held", "pending", "confirmed", "paid"]).default("paid"),
  channel: z.enum(["pos", "self_order", "kiosk"]).default("pos"),
  tableId: z.string().uuid().optional(),
  notes: z.string().max(2_000).optional(),
  offlineReference: z.string().max(200).optional(),
  discountAmount: bigintInput.default(0n),
  serviceChargeAmount: bigintInput.default(0n),
  promotionCode: z.string().max(100).optional(),
  voucherCode: z.string().max(100).optional(),
  items: z.array(z.object({
    variantId: z.string().uuid(),
    quantity: positiveBigint,
    unitPriceAmount: bigintInput.optional(),
    discountAmount: bigintInput.default(0n),
    notes: z.string().max(500).optional(),
  })).min(1).max(500),
  payments: z.array(z.object({
    method: z.enum(["cash", "debit", "credit", "qris", "e_wallet", "transfer", "pay_later", "store_credit"]),
    amount: positiveBigint,
    provider: z.string().max(100).optional(),
    externalReference: z.string().max(200).optional(),
  })).max(20).default([]),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

export type CheckoutQuote = {
  subtotalAmount: bigint;
  itemDiscountAmount: bigint;
  orderDiscountAmount: bigint;
  promotionDiscountAmount: bigint;
  discountAmount: bigint;
  taxAmount: bigint;
  exclusiveTaxAmount: bigint;
  serviceChargeAmount: bigint;
  totalAmount: bigint;
};

/**
 * Context yang dipakai checkout. Untuk anonymous self-order/kiosk,
 * actorUserId dan IP/UA datang dari self-order context (tanpa auth session).
 */
export type CheckoutContext = {
  organizationId: string;
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
  actorUserId: string | null;
};

export function checkoutContextFromApi(context: ApiContext): CheckoutContext {
  return {
    organizationId: context.organizationId,
    requestId: context.requestId,
    ...(context.ipAddress ? { ipAddress: context.ipAddress } : {}),
    ...(context.userAgent ? { userAgent: context.userAgent } : {}),
    actorUserId: context.session.user.id,
  };
}

async function calculateCheckout(
  database: Database,
  input: CheckoutInput,
  organizationId: string,
) {
  const variants = await database
    .select({
      id: productVariants.id,
      productId: productVariants.productId,
      sku: productVariants.sku,
      name: productVariants.name,
      costAmount: productVariants.costAmount,
      priceAmount: productVariants.priceAmount,
      productName: products.name,
      trackStock: products.trackStock,
      allowNegativeStock: products.allowNegativeStock,
      taxRateId: products.taxRateId,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(and(
      eq(productVariants.organizationId, organizationId),
      eq(productVariants.isActive, true),
      eq(products.isActive, true),
      inArray(productVariants.id, input.items.map((item) => item.variantId)),
    ));
  const byId = new Map(variants.map((variant) => [variant.id, variant]));
  if (byId.size !== new Set(input.items.map((item) => item.variantId)).size) {
    throw new AppError("NOT_FOUND", "One or more variants are unavailable");
  }

  const taxRateIds = [...new Set(variants.map((variant) => variant.taxRateId).filter((id): id is string => Boolean(id)))];
  const taxRateRows = taxRateIds.length
    ? await database
        .select({ id: taxRates.id, rate: taxRates.rate, isInclusive: taxRates.isInclusive })
        .from(taxRates)
        .where(and(eq(taxRates.organizationId, organizationId), inArray(taxRates.id, taxRateIds)))
    : [];
  const taxRateMap = new Map(taxRateRows.map((row) => [row.id, row]));

  let subtotalAmount = 0n;
  let costAmount = 0n;
  let itemDiscountTotal = 0n;
  const lines = input.items.map((item) => {
    const variant = byId.get(item.variantId)!;
    const unitPriceAmount = variant.priceAmount;
    const gross = unitPriceAmount * item.quantity;
    if (item.discountAmount > gross) {
      throw new AppError("VALIDATION_ERROR", "Item discount cannot exceed item gross amount");
    }
    const itemTotal = gross - item.discountAmount;
    subtotalAmount += gross;
    costAmount += variant.costAmount * item.quantity;
    itemDiscountTotal += item.discountAmount;

    return { item, variant, unitPriceAmount, totalAmount: itemTotal };
  });

  if (input.discountAmount > subtotalAmount - itemDiscountTotal) {
    throw new AppError("VALIDATION_ERROR", "Order discount cannot exceed the amount after item discounts");
  }

  const taxableForPromo = subtotalAmount - itemDiscountTotal - input.discountAmount;
  const { totalDiscount: promoDiscount, records: promoRecords } = await resolvePromotionDiscount(database, {
    organizationId,
    taxableAmount: taxableForPromo > 0n ? taxableForPromo : 0n,
    promotionCode: input.promotionCode,
    voucherCode: input.voucherCode,
    customerId: input.customerId,
  });
  const totalDiscountAmount = input.discountAmount + promoDiscount;
  const allocated = allocateDiscount(lines.map((line) => line.totalAmount), totalDiscountAmount);
  let taxAmount = 0n;
  let exclusiveTaxAmount = 0n;
  const calculated = lines.map((line, index) => {
    const taxRate = line.variant.taxRateId ? taxRateMap.get(line.variant.taxRateId) : undefined;
    const rateBps = taxRate ? parseRateToBps(taxRate.rate) : 0n;
    const taxableAmount = line.totalAmount - allocated[index];
    const itemTaxAmount = taxRate?.isInclusive
      ? inclusiveTax(taxableAmount, rateBps)
      : exclusiveTax(taxableAmount, rateBps);
    taxAmount += itemTaxAmount;
    if (taxRate && !taxRate.isInclusive) exclusiveTaxAmount += itemTaxAmount;
    return { ...line, taxAmount: itemTaxAmount };
  });
  const totalAmount = subtotalAmount - itemDiscountTotal - totalDiscountAmount + input.serviceChargeAmount + exclusiveTaxAmount;

  const quote: CheckoutQuote = {
    subtotalAmount,
    itemDiscountAmount: itemDiscountTotal,
    orderDiscountAmount: input.discountAmount,
    promotionDiscountAmount: promoDiscount,
    discountAmount: itemDiscountTotal + totalDiscountAmount,
    taxAmount,
    exclusiveTaxAmount,
    serviceChargeAmount: input.serviceChargeAmount,
    totalAmount,
  };

  return { calculated, costAmount, promoRecords, totalDiscountAmount, quote };
}

export async function quoteCheckout(input: CheckoutInput, context: CheckoutContext): Promise<CheckoutQuote> {
  const { quote } = await calculateCheckout(db, input, context.organizationId);
  return quote;
}

export async function checkout(input: CheckoutInput, context: CheckoutContext) {
  await assertCanCreateOrder(context.organizationId);
  const result = await db.transaction(async (tx) => {
    const [branch] = await tx.select({ id: branches.id }).from(branches).where(and(
      eq(branches.id, input.branchId),
      eq(branches.organizationId, context.organizationId),
      eq(branches.isActive, true),
    )).limit(1);
    if (!branch) throw new AppError("FORBIDDEN", "Cabang tidak tersedia untuk organisasi ini");
    if (input.tableId) {
      const [table] = await tx.select({ id: diningTables.id }).from(diningTables).where(and(
        eq(diningTables.id, input.tableId),
        eq(diningTables.organizationId, context.organizationId),
        eq(diningTables.branchId, input.branchId),
        eq(diningTables.isActive, true),
      )).limit(1);
      if (!table) throw new AppError("FORBIDDEN", "Meja tidak tersedia untuk cabang ini");
    }
    if (input.customerId) {
      const [customer] = await tx.select({ id: customers.id }).from(customers).where(and(
        eq(customers.id, input.customerId),
        eq(customers.organizationId, context.organizationId),
        eq(customers.isActive, true),
      )).limit(1);
      if (!customer) throw new AppError("NOT_FOUND", "Customer not found");
    }
    if (input.channel === "pos") {
      await assertPeriodOpen(tx, { organizationId: context.organizationId, branchId: input.branchId });
    }
    const [warehouse] = await tx
      .select({ id: warehouses.id, branchId: warehouses.branchId })
      .from(warehouses)
      .where(and(eq(warehouses.id, input.warehouseId), eq(warehouses.organizationId, context.organizationId), eq(warehouses.isActive, true)))
      .limit(1);
    if (!warehouse || warehouse.branchId !== input.branchId) {
      throw new AppError("FORBIDDEN", "Gudang tidak tersedia untuk cabang ini");
    }

    let cashSession: { id: string } | null = null;
    if (input.channel === "pos" && input.cashSessionId && context.actorUserId) {
      const [session] = await tx
        .select({ id: cashRegisterSessions.id, userId: cashRegisterSessions.userId })
        .from(cashRegisterSessions)
        .innerJoin(cashRegisters, eq(cashRegisters.id, cashRegisterSessions.registerId))
        .where(and(
          eq(cashRegisterSessions.id, input.cashSessionId),
          eq(cashRegisterSessions.organizationId, context.organizationId),
          eq(cashRegisterSessions.status, "open"),
          eq(cashRegisterSessions.userId, context.actorUserId),
          eq(cashRegisters.branchId, input.branchId),
        ))
        .limit(1);
      if (!session) throw new AppError("CONFLICT", "Buka shift kasir sebelum melakukan checkout");
      cashSession = session;
    }

    const {
      calculated,
      costAmount,
      promoRecords,
      totalDiscountAmount,
      quote,
    } = await calculateCheckout(tx as unknown as Database, input, context.organizationId);
    const { subtotalAmount, taxAmount, totalAmount } = quote;
    const paymentAmount = input.payments.reduce((sum, payment) => sum + payment.amount, 0n);
    const isDeferred = input.payments.some((payment) => payment.method === "pay_later");
    const hasCash = input.payments.some((payment) => payment.method === "cash");
    const hasOnlinePayment = input.payments.some((payment) => Boolean(payment.provider && payment.provider.trim()));
    if (hasOnlinePayment && input.payments.length !== 1) {
      throw new AppError("VALIDATION_ERROR", "Pembayaran online harus menggunakan satu metode pembayaran");
    }
    // Online provider payments are not settled at checkout; the order stays pending
    // until the payment gateway webhook confirms settlement.
    const effectiveStatus = hasOnlinePayment ? "pending" : input.status;
    const reservationExpiry = hasOnlinePayment && effectiveStatus === "pending"
      ? new Date(Date.now() + ONLINE_RESERVATION_MS)
      : null;
    if (effectiveStatus === "paid" && paymentAmount < totalAmount && !isDeferred) throw new AppError("VALIDATION_ERROR", "Payment total is less than order total");
    if (effectiveStatus === "paid" && paymentAmount > totalAmount && !hasCash) throw new AppError("VALIDATION_ERROR", "Non-cash payment cannot exceed order total");
    const paidAmount = effectiveStatus === "paid" ? (paymentAmount > totalAmount ? totalAmount : paymentAmount) : 0n;
    const changeAmount = effectiveStatus === "paid" && paymentAmount > totalAmount ? paymentAmount - totalAmount : 0n;

    const orderId = crypto.randomUUID();
    const prefix = input.channel === "self_order" ? "SO" : input.channel === "kiosk" ? "KS" : "POS";
    const orderNumber = `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${orderId.slice(0, 8).toUpperCase()}`;
    const [order] = await tx.insert(salesOrders).values({
      id: orderId,
      organizationId: context.organizationId,
      branchId: input.branchId,
      warehouseId: input.warehouseId,
      customerId: input.customerId,
      cashierUserId: context.actorUserId,
      cashSessionId: cashSession?.id,
      tableId: input.tableId,
      orderNumber,
      type: input.type,
      channel: input.channel,
      status: effectiveStatus,
      subtotalAmount,
      discountAmount: totalDiscountAmount,
      taxAmount,
      serviceChargeAmount: input.serviceChargeAmount,
      totalAmount,
      paidAmount,
      changeAmount,
      costAmount,
      notes: input.notes,
      offlineReference: input.offlineReference,
      metadata: reservationExpiry
        ? { stockReservationVersion: 1, reservationExpiresAt: reservationExpiry.toISOString() }
        : undefined,
      completedAt: effectiveStatus === "paid" ? new Date() : undefined,
    }).returning();

    // Record applied promotions/vouchers (insert order_promotions + update usage counters)
    if (promoRecords.length) {
      await recordPromotions(tx as unknown as Database, { organizationId: context.organizationId, orderId, records: promoRecords });
    }

    const orderItems = await tx.insert(salesOrderItems).values(calculated.map(({ item, variant, unitPriceAmount, totalAmount: itemTotal, taxAmount: itemTax }) => ({
      organizationId: context.organizationId,
      orderId,
      variantId: variant.id,
      taxRateId: variant.taxRateId,
      itemName: `${variant.productName} - ${variant.name}`,
      sku: variant.sku,
      quantity: item.quantity,
      unitPriceAmount,
      unitCostAmount: variant.costAmount,
      discountAmount: item.discountAmount,
      taxAmount: itemTax,
      totalAmount: itemTotal,
      notes: item.notes,
    }))).returning();

    if (reservationExpiry) {
      await reserveOrderStock(tx, {
        organizationId: context.organizationId,
        warehouseId: input.warehouseId,
        orderId,
        expiresAt: reservationExpiry,
        items: calculated.map(({ item, variant }) => ({
          variantId: variant.id,
          quantity: item.quantity,
          trackStock: variant.trackStock,
          allowNegativeStock: variant.allowNegativeStock,
        })),
      });
    }

    if (effectiveStatus === "paid" || effectiveStatus === "confirmed") {
      for (const { item, variant } of calculated) {
        if (!variant.trackStock) continue;
        await postStockMovement(tx, {
          organizationId: context.organizationId,
          branchId: input.branchId,
          warehouseId: input.warehouseId,
          variantId: variant.id,
          quantity: -item.quantity,
          type: "sale",
          referenceType: "sales_order",
          referenceId: orderId,
          unitCostAmount: variant.costAmount,
          actorUserId: context.actorUserId ?? undefined,
          allowNegative: variant.allowNegativeStock,
        });
      }

      // Only create kitchen tickets for self-order and kiosk orders that are confirmed/paid
      if (input.channel === "self_order" || input.channel === "kiosk") {
        const ticketId = crypto.randomUUID();
        const ticketNumber = `KT-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${ticketId.slice(0, 8).toUpperCase()}`;
        await tx.insert(kitchenTickets).values({
          id: ticketId,
          organizationId: context.organizationId,
          branchId: input.branchId,
          orderId,
          number: ticketNumber,
          status: "queued",
          priority: 0,
        });
        await tx.insert(kitchenTicketItems).values(orderItems.map((orderItem) => ({
          organizationId: context.organizationId,
          ticketId,
          orderItemId: orderItem.id,
          status: "queued" as const,
          notes: orderItem.notes,
        })));
      }
    }

    const payments = input.payments.length ? await tx.insert(salesPayments).values(input.payments.map((payment) => {
      const isOnline = Boolean(payment.provider && payment.provider.trim());
      const isAuthorized = payment.method === "pay_later" || isOnline;
      // Online/pending payments record the amount owed (already captured as total);
      // a 0 amount would violate sales_payments_positive_amount (amount > 0).
      const amount = isOnline && payment.amount === 0n ? totalAmount : payment.amount;
      return {
        organizationId: context.organizationId,
        orderId,
        method: payment.method,
        amount,
        provider: payment.provider,
        externalReference: payment.externalReference,
        status: isAuthorized ? "authorized" as const : "settled" as const,
        paidAt: isAuthorized ? undefined : new Date(),
      };
    })).returning() : [];

    let pointsEarned = 0n;
    if (input.customerId && effectiveStatus === "paid") {
      const [customer] = await tx.select({ id: customers.id }).from(customers).where(and(eq(customers.id, input.customerId), eq(customers.organizationId, context.organizationId))).limit(1);
      if (!customer) throw new AppError("NOT_FOUND", "Customer not found");
      await tx.update(customers).set({ totalSpendAmount: sql`${customers.totalSpendAmount} + ${totalAmount}`, updatedAt: new Date() }).where(eq(customers.id, customer.id));
      pointsEarned = totalAmount / 10_000n;
      if (pointsEarned > 0n) {
        const [account] = await tx.insert(loyaltyAccounts).values({ organizationId: context.organizationId, customerId: customer.id }).onConflictDoUpdate({ target: loyaltyAccounts.customerId, set: { pointsBalance: sql`${loyaltyAccounts.pointsBalance} + ${pointsEarned}`, lifetimePoints: sql`${loyaltyAccounts.lifetimePoints} + ${pointsEarned}`, updatedAt: new Date() } }).returning();
        await tx.insert(loyaltyTransactions).values({ organizationId: context.organizationId, loyaltyAccountId: account.id, type: "earn", points: pointsEarned, referenceType: "sales_order", referenceId: orderId, description: `Poin transaksi ${orderNumber}` });
      }
    }

    // Accrue sales commission for the cashier (if registered as an employee with a rate)
    if (effectiveStatus === "paid" && context.actorUserId) {
      await accrueCommission(tx as unknown as Database, {
        organizationId: context.organizationId,
        cashierUserId: context.actorUserId,
        orderId,
        totalAmount,
      });
    }

    // Post to financial ledger (double-entry)
    if (effectiveStatus === "paid") {
      await postSaleToLedger(tx as unknown as Database, {
        organizationId: context.organizationId,
        branchId: input.branchId,
        orderId,
        orderNumber,
        totalAmount,
        changeAmount,
        payments: input.payments.filter((p) => p.method !== "pay_later").map((p) => ({ method: p.method, amount: p.amount })),
        actorUserId: context.actorUserId,
      });
    }

    // Receipt is created immediately for paid/confirmed orders. For pending orders
    // (awaiting online payment settlement) the receipt is created by confirmOrderPayment
    // when the payment gateway webhook confirms settlement.
    let receipt: { verificationToken: string } | null = null;
    if (effectiveStatus === "paid" || effectiveStatus === "confirmed") {
      const verificationToken = crypto.randomUUID().replaceAll("-", "");
      [receipt] = await tx.insert(receipts).values({ organizationId: context.organizationId, orderId, verificationToken }).returning();
    }
    return { order, items: orderItems, payments, receipt, pointsEarned, reservationExpiresAt: reservationExpiry?.toISOString() ?? null };
  });

  // Post-commit Redis cache invalidations & real-time events
  void cacheDel(
    RedisKeys.tables(context.organizationId, input.branchId),
    RedisKeys.catalog(context.organizationId, input.branchId),
    `tenant:${context.organizationId}:branch:${input.branchId}:warehouse:${input.warehouseId}:pos-bootstrap`,
  );

  if (result.order.status === "paid" || result.order.status === "confirmed") {
    void publishEvent(RedisKeys.kdsChannel(input.branchId), {
      type: "TICKET_CREATED",
      orderId: result.order.id,
      orderNumber: result.order.orderNumber,
      status: result.order.status,
    });
  }

  void publishEvent(RedisKeys.orderEventsChannel(context.organizationId, input.branchId), {
    type: "ORDER_CREATED",
    orderId: result.order.id,
    orderNumber: result.order.orderNumber,
    totalAmount: result.order.totalAmount,
    status: result.order.status,
  });

  return result;
}
