import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  goodsReceiptItems,
  goodsReceipts,
  purchaseOrderItems,
  purchaseOrders,
} from "@/db/schema";
import type { ApiContext } from "@/lib/api";
import { AppError } from "@/lib/server";
import { postStockMovement } from "./stock-ledger";

const quantity = z.union([z.string().regex(/^\d+$/), z.number().int().positive().safe()]).transform(BigInt).refine((value) => value > 0n);
const amount = z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative().safe()]).transform(BigInt);

export const receivePurchaseSchema = z.object({
  purchaseOrderId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  notes: z.string().max(1_000).optional(),
  items: z.array(z.object({
    purchaseOrderItemId: z.string().uuid(),
    variantId: z.string().uuid(),
    acceptedQuantity: quantity,
    rejectedQuantity: quantity.optional().default(0n),
    unitCostAmount: amount,
    batchNumber: z.string().max(100).optional(),
    expiryDate: z.string().date().optional(),
  })).min(1).max(500),
});

export async function receivePurchase(input: z.infer<typeof receivePurchaseSchema>, context: ApiContext) {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(purchaseOrders).where(and(eq(purchaseOrders.id, input.purchaseOrderId), eq(purchaseOrders.organizationId, context.organizationId))).limit(1);
    if (!order) throw new AppError("NOT_FOUND", "Purchase order not found");
    if (order.status === "cancelled" || order.status === "received") throw new AppError("CONFLICT", "Purchase order cannot receive more items");

    const receiptId = crypto.randomUUID();
    const receiptNumber = `GR-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${receiptId.slice(0, 8).toUpperCase()}`;
    const [receipt] = await tx.insert(goodsReceipts).values({
      id: receiptId,
      organizationId: context.organizationId,
      purchaseOrderId: order.id,
      warehouseId: input.warehouseId,
      receiptNumber,
      status: "posted",
      receivedBy: context.session.user.id,
      notes: input.notes,
    }).returning();

    for (const item of input.items) {
      const [orderItem] = await tx.select().from(purchaseOrderItems).where(and(eq(purchaseOrderItems.id, item.purchaseOrderItemId), eq(purchaseOrderItems.purchaseOrderId, order.id), eq(purchaseOrderItems.variantId, item.variantId))).limit(1);
      if (!orderItem) throw new AppError("NOT_FOUND", "Purchase order item not found");
      if (orderItem.receivedQuantity + item.acceptedQuantity > orderItem.quantity) throw new AppError("VALIDATION_ERROR", "Accepted quantity exceeds outstanding purchase quantity");
      await tx.insert(goodsReceiptItems).values({
        organizationId: context.organizationId,
        goodsReceiptId: receiptId,
        purchaseOrderItemId: orderItem.id,
        variantId: item.variantId,
        quantity: item.acceptedQuantity + item.rejectedQuantity,
        acceptedQuantity: item.acceptedQuantity,
        rejectedQuantity: item.rejectedQuantity,
        batchNumber: item.batchNumber,
        expiryDate: item.expiryDate,
        unitCostAmount: item.unitCostAmount,
      });
      await tx.update(purchaseOrderItems).set({ receivedQuantity: sql`${purchaseOrderItems.receivedQuantity} + ${item.acceptedQuantity}`, updatedAt: new Date() }).where(eq(purchaseOrderItems.id, orderItem.id));
      await postStockMovement(tx, {
        organizationId: context.organizationId,
        branchId: order.branchId ?? undefined,
        warehouseId: input.warehouseId,
        variantId: item.variantId,
        quantity: item.acceptedQuantity,
        type: "purchase",
        referenceType: "goods_receipt",
        referenceId: receiptId,
        unitCostAmount: item.unitCostAmount,
        actorUserId: context.session.user.id,
      });
    }

    const allItems = await tx.select({ quantity: purchaseOrderItems.quantity, receivedQuantity: purchaseOrderItems.receivedQuantity }).from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, order.id));
    const fullyReceived = allItems.every((item) => item.receivedQuantity >= item.quantity);
    await tx.update(purchaseOrders).set({ status: fullyReceived ? "received" : "partially_received", updatedAt: new Date() }).where(eq(purchaseOrders.id, order.id));
    return receipt;
  });
}
