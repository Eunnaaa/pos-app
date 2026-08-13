import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@/db";
import {
  customers,
  kitchenTicketItems,
  kitchenTickets,
  loyaltyAccounts,
  loyaltyTransactions,
  productVariants,
  products,
  receipts,
  salesOrderItems,
  salesOrders,
  salesPayments,
} from "@/db/schema";
import { postStockMovement, type DbTransaction } from "./stock-ledger";
import { postSaleToLedger } from "./ledger";
import { accrueCommission } from "./commissions";

type Tx = DbTransaction;

/**
 * Query the data needed to confirm an order's payment side effects:
 * stock decrement, kitchen ticket, loyalty, ledger, and receipt.
 * Used by checkout (immediate) and the payment webhook (deferred settlement).
 */
export async function confirmOrderPayment(tx: Tx, params: {
  organizationId: string;
  orderId: string;
  actorUserId: string | null;
}): Promise<{ pointsEarned: bigint }> {
  const [order] = await tx
    .select({
      id: salesOrders.id,
      organizationId: salesOrders.organizationId,
      branchId: salesOrders.branchId,
      warehouseId: salesOrders.warehouseId,
      orderNumber: salesOrders.orderNumber,
      totalAmount: salesOrders.totalAmount,
      changeAmount: salesOrders.changeAmount,
      customerId: salesOrders.customerId,
      cashierUserId: salesOrders.cashierUserId,
      status: salesOrders.status,
    })
    .from(salesOrders)
    .where(and(eq(salesOrders.id, params.orderId), eq(salesOrders.organizationId, params.organizationId)))
    .limit(1);
  if (!order) throw new Error(`Order ${params.orderId} not found`);

  // Load order items joined with variant + product for stock tracking
  const items = await tx
    .select({
      id: salesOrderItems.id,
      variantId: salesOrderItems.variantId,
      quantity: salesOrderItems.quantity,
      notes: salesOrderItems.notes,
      trackStock: products.trackStock,
      allowNegativeStock: products.allowNegativeStock,
      costAmount: productVariants.costAmount,
    })
    .from(salesOrderItems)
    .innerJoin(productVariants, eq(productVariants.id, salesOrderItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(salesOrderItems.orderId, order.id));

  // Load settled payments for ledger posting
  const payments = await tx
    .select({ method: salesPayments.method, amount: salesPayments.amount })
    .from(salesPayments)
    .where(and(eq(salesPayments.orderId, order.id), eq(salesPayments.status, "settled")));

  let pointsEarned = 0n;

  // 1. Decrement stock for stockable items
  for (const item of items) {
    if (!item.trackStock || !item.variantId) continue;
    await postStockMovement(tx, {
      organizationId: order.organizationId,
      branchId: order.branchId,
      warehouseId: order.warehouseId,
      variantId: item.variantId,
      quantity: -item.quantity,
      type: "sale",
      referenceType: "sales_order",
      referenceId: order.id,
      unitCostAmount: item.costAmount,
      actorUserId: params.actorUserId ?? undefined,
      allowNegative: item.allowNegativeStock,
    });
  }

  // 2. Create kitchen ticket
  const ticketId = crypto.randomUUID();
  const ticketNumber = `KT-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${ticketId.slice(0, 8).toUpperCase()}`;
  await tx.insert(kitchenTickets).values({
    id: ticketId,
    organizationId: order.organizationId,
    branchId: order.branchId,
    orderId: order.id,
    number: ticketNumber,
    status: "queued",
    priority: 0,
  });
  await tx.insert(kitchenTicketItems).values(items.map((item) => ({
    organizationId: order.organizationId,
    ticketId,
    orderItemId: item.id,
    status: "queued" as const,
    notes: item.notes,
  })));

  // 3. Award loyalty points
  if (order.customerId) {
    const [customer] = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.id, order.customerId), eq(customers.organizationId, order.organizationId)))
      .limit(1);
    if (customer) {
      await tx.update(customers).set({ totalSpendAmount: sql`${customers.totalSpendAmount} + ${order.totalAmount}`, updatedAt: new Date() }).where(eq(customers.id, customer.id));
      pointsEarned = order.totalAmount / 10_000n;
      if (pointsEarned > 0n) {
        const [account] = await tx.insert(loyaltyAccounts).values({ organizationId: order.organizationId, customerId: customer.id }).onConflictDoUpdate({ target: loyaltyAccounts.customerId, set: { pointsBalance: sql`${loyaltyAccounts.pointsBalance} + ${pointsEarned}`, lifetimePoints: sql`${loyaltyAccounts.lifetimePoints} + ${pointsEarned}`, updatedAt: new Date() } }).returning();
        await tx.insert(loyaltyTransactions).values({ organizationId: order.organizationId, loyaltyAccountId: account.id, type: "earn", points: pointsEarned, referenceType: "sales_order", referenceId: order.id, description: `Poin transaksi ${order.orderNumber}` });
      }
    }
  }

  // 4. Post to financial ledger (double-entry)
  await postSaleToLedger(tx as unknown as Database, {
    organizationId: order.organizationId,
    branchId: order.branchId,
    orderId: order.id,
    orderNumber: order.orderNumber,
    totalAmount: order.totalAmount,
    changeAmount: order.changeAmount,
    payments: payments.filter((p) => p.method !== "pay_later").map((p) => ({ method: p.method, amount: p.amount })),
    actorUserId: params.actorUserId,
  });

  // 5. Create receipt (if not already present)
  const [existingReceipt] = await tx.select({ id: receipts.id }).from(receipts).where(eq(receipts.orderId, order.id)).limit(1);
  if (!existingReceipt) {
    const verificationToken = crypto.randomUUID().replaceAll("-", "");
    await tx.insert(receipts).values({ organizationId: order.organizationId, orderId: order.id, verificationToken });
  }

  // 6. Mark order as paid + completed
  await tx.update(salesOrders).set({ status: "paid", paidAmount: order.totalAmount, completedAt: new Date(), updatedAt: new Date() }).where(eq(salesOrders.id, order.id));

  // 7. Accrue sales commission for the cashier (if registered as an employee with a rate)
  if (order.cashierUserId) {
    await accrueCommission(tx as unknown as Database, {
      organizationId: order.organizationId,
      cashierUserId: order.cashierUserId,
      orderId: order.id,
      totalAmount: order.totalAmount,
    });
  }

  return { pointsEarned };
}
