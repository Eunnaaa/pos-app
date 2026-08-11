import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Database } from "@/db";
import {
  cashRegisters,
  cashRegisterSessions,
  customers,
  kitchenTickets,
  kitchenTicketItems,
  loyaltyAccounts,
  loyaltyTransactions,
  productVariants,
  products,
  receipts,
  warehouses,
  salesOrderItems,
  salesOrders,
  salesPayments,
} from "@/db/schema";
import type { ApiContext } from "@/lib/api";
import { assertPeriodOpen, AppError } from "@/lib/server";
import { postStockMovement } from "./stock-ledger";
import { postSaleToLedger } from "./ledger";

const bigintInput = z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative().safe()]).transform(BigInt);
const positiveBigint = bigintInput.refine((value) => value > 0n, "Must be greater than zero");

export const checkoutSchema = z.object({
  branchId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  cashSessionId: z.string().uuid(),
  customerId: z.string().uuid().optional(),
  type: z.enum(["sale", "quotation", "invoice"]).default("sale"),
  status: z.enum(["draft", "held", "pending", "confirmed", "paid"]).default("paid"),
  notes: z.string().max(2_000).optional(),
  offlineReference: z.string().max(200).optional(),
  discountAmount: bigintInput.default(0n),
  serviceChargeAmount: bigintInput.default(0n),
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

export async function checkout(input: CheckoutInput, context: ApiContext) {
  return db.transaction(async (tx) => {
    await assertPeriodOpen(tx, { organizationId: context.organizationId, branchId: input.branchId });
    const [warehouse] = await tx
      .select({ id: warehouses.id, branchId: warehouses.branchId })
      .from(warehouses)
      .where(and(eq(warehouses.id, input.warehouseId), eq(warehouses.organizationId, context.organizationId), eq(warehouses.isActive, true)))
      .limit(1);
    if (!warehouse || (warehouse.branchId && warehouse.branchId !== input.branchId)) {
      throw new AppError("FORBIDDEN", "Gudang tidak tersedia untuk cabang ini");
    }
    const [cashSession] = await tx
      .select({ id: cashRegisterSessions.id, userId: cashRegisterSessions.userId })
      .from(cashRegisterSessions)
      .innerJoin(cashRegisters, eq(cashRegisters.id, cashRegisterSessions.registerId))
      .where(and(
        eq(cashRegisterSessions.id, input.cashSessionId),
        eq(cashRegisterSessions.organizationId, context.organizationId),
        eq(cashRegisterSessions.status, "open"),
        eq(cashRegisterSessions.userId, context.session.user.id),
        eq(cashRegisters.branchId, input.branchId),
      ))
      .limit(1);
    if (!cashSession) throw new AppError("CONFLICT", "Buka shift kasir sebelum melakukan checkout");

    const variants = await tx
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
        eq(productVariants.organizationId, context.organizationId),
        eq(productVariants.isActive, true),
        eq(products.isActive, true),
        inArray(productVariants.id, input.items.map((item) => item.variantId)),
      ));
    const byId = new Map(variants.map((variant) => [variant.id, variant]));
    if (byId.size !== new Set(input.items.map((item) => item.variantId)).size) throw new AppError("NOT_FOUND", "One or more variants are unavailable");

    let subtotalAmount = 0n;
    let costAmount = 0n;
    const calculated = input.items.map((item) => {
      const variant = byId.get(item.variantId)!;
      const unitPriceAmount = variant.priceAmount;
      const gross = unitPriceAmount * item.quantity;
      if (item.discountAmount > gross) throw new AppError("VALIDATION_ERROR", "Item discount cannot exceed item gross amount");
      const totalAmount = gross - item.discountAmount;
      subtotalAmount += gross;
      costAmount += variant.costAmount * item.quantity;
      return { item, variant, unitPriceAmount, totalAmount };
    });

    if (input.discountAmount > subtotalAmount) throw new AppError("VALIDATION_ERROR", "Order discount cannot exceed subtotal");
    const taxAmount = 0n;
    const totalAmount = subtotalAmount - input.discountAmount + input.serviceChargeAmount + taxAmount;
    const paymentAmount = input.payments.reduce((sum, payment) => sum + payment.amount, 0n);
    const isDeferred = input.payments.some((payment) => payment.method === "pay_later");
    const hasCash = input.payments.some((payment) => payment.method === "cash");
    if (input.status === "paid" && paymentAmount < totalAmount && !isDeferred) throw new AppError("VALIDATION_ERROR", "Payment total is less than order total");
    if (input.status === "paid" && paymentAmount > totalAmount && !hasCash) throw new AppError("VALIDATION_ERROR", "Non-cash payment cannot exceed order total");
    const paidAmount = paymentAmount > totalAmount ? totalAmount : paymentAmount;
    const changeAmount = paymentAmount > totalAmount ? paymentAmount - totalAmount : 0n;

    const orderId = crypto.randomUUID();
    const orderNumber = `POS-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${orderId.slice(0, 8).toUpperCase()}`;
    const [order] = await tx.insert(salesOrders).values({
      id: orderId,
      organizationId: context.organizationId,
      branchId: input.branchId,
      warehouseId: input.warehouseId,
      customerId: input.customerId,
      cashierUserId: context.session.user.id,
      cashSessionId: cashSession.id,
      orderNumber,
      type: input.type,
      status: input.status,
      subtotalAmount,
      discountAmount: input.discountAmount,
      taxAmount,
      serviceChargeAmount: input.serviceChargeAmount,
      totalAmount,
      paidAmount,
      changeAmount,
      costAmount,
      notes: input.notes,
      offlineReference: input.offlineReference,
      completedAt: input.status === "paid" ? new Date() : undefined,
    }).returning();

    const orderItems = await tx.insert(salesOrderItems).values(calculated.map(({ item, variant, unitPriceAmount, totalAmount: itemTotal }) => ({
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
      totalAmount: itemTotal,
      notes: item.notes,
    }))).returning();

    if (input.status === "paid" || input.status === "confirmed") {
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
          actorUserId: context.session.user.id,
          allowNegative: variant.allowNegativeStock,
        });
      }

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

    const payments = input.payments.length ? await tx.insert(salesPayments).values(input.payments.map((payment) => ({
      organizationId: context.organizationId,
      orderId,
      method: payment.method,
      amount: payment.amount,
      provider: payment.provider,
      externalReference: payment.externalReference,
      status: payment.method === "pay_later" ? "authorized" as const : "settled" as const,
      paidAt: payment.method === "pay_later" ? undefined : new Date(),
    }))).returning() : [];

    let pointsEarned = 0n;
    if (input.customerId && input.status === "paid") {
      const [customer] = await tx.select({ id: customers.id }).from(customers).where(and(eq(customers.id, input.customerId), eq(customers.organizationId, context.organizationId))).limit(1);
      if (!customer) throw new AppError("NOT_FOUND", "Customer not found");
      await tx.update(customers).set({ totalSpendAmount: sql`${customers.totalSpendAmount} + ${totalAmount}`, updatedAt: new Date() }).where(eq(customers.id, customer.id));
      pointsEarned = totalAmount / 10_000n;
      if (pointsEarned > 0n) {
        const [account] = await tx.insert(loyaltyAccounts).values({ organizationId: context.organizationId, customerId: customer.id }).onConflictDoUpdate({ target: loyaltyAccounts.customerId, set: { pointsBalance: sql`${loyaltyAccounts.pointsBalance} + ${pointsEarned}`, lifetimePoints: sql`${loyaltyAccounts.lifetimePoints} + ${pointsEarned}`, updatedAt: new Date() } }).returning();
        await tx.insert(loyaltyTransactions).values({ organizationId: context.organizationId, loyaltyAccountId: account.id, type: "earn", points: pointsEarned, referenceType: "sales_order", referenceId: orderId, description: `Poin transaksi ${orderNumber}` });
      }
    }

    // Post to financial ledger (double-entry)
    if (input.status === "paid") {
      await postSaleToLedger(tx as unknown as Database, {
        organizationId: context.organizationId,
        branchId: input.branchId,
        orderId,
        orderNumber,
        totalAmount,
        changeAmount,
        payments: input.payments.filter((p) => p.method !== "pay_later").map((p) => ({ method: p.method, amount: p.amount })),
        actorUserId: context.session.user.id,
      });
    }

    const verificationToken = crypto.randomUUID().replaceAll("-", "");
    const [receipt] = await tx.insert(receipts).values({ organizationId: context.organizationId, orderId, verificationToken }).returning();
    return { order, items: orderItems, payments, receipt, pointsEarned };
  });
}
