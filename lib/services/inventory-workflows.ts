import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { stockTransferItems, stockTransfers } from "@/db/schema";
import type { ApiContext } from "@/lib/api";
import { AppError } from "@/lib/server";
import { postStockMovement } from "./stock-ledger";

const quantity = z.union([z.string().regex(/^\d+$/), z.number().int().positive().safe()]).transform(BigInt).refine((value) => value > 0n);

export const stockAdjustmentSchema = z.object({
  branchId: z.string().uuid().optional(),
  warehouseId: z.string().uuid(),
  variantId: z.string().uuid(),
  quantity: z.union([z.string().regex(/^-?\d+$/), z.number().int().safe()]).transform(BigInt).refine((value) => value !== 0n),
  reason: z.string().min(3).max(500),
  allowNegative: z.boolean().default(false),
});

export const stockTransferSchema = z.object({
  fromWarehouseId: z.string().uuid(),
  toWarehouseId: z.string().uuid(),
  notes: z.string().max(1_000).optional(),
  items: z.array(z.object({ variantId: z.string().uuid(), quantity })).min(1).max(500),
}).refine((input) => input.fromWarehouseId !== input.toWarehouseId, { message: "Source and destination warehouses must differ" });

export async function adjustStock(input: z.infer<typeof stockAdjustmentSchema>, context: ApiContext) {
  return db.transaction((tx) => postStockMovement(tx, {
    organizationId: context.organizationId,
    branchId: input.branchId,
    warehouseId: input.warehouseId,
    variantId: input.variantId,
    quantity: input.quantity,
    type: "adjustment",
    reason: input.reason,
    actorUserId: context.session.user.id,
    allowNegative: context.tenant.role === "owner" && input.allowNegative,
  }));
}

export async function createStockTransfer(input: z.infer<typeof stockTransferSchema>, context: ApiContext) {
  return db.transaction(async (tx) => {
    const transferId = crypto.randomUUID();
    const transferNumber = `TRF-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${transferId.slice(0, 8).toUpperCase()}`;
    const [transfer] = await tx.insert(stockTransfers).values({
      id: transferId,
      organizationId: context.organizationId,
      transferNumber,
      fromWarehouseId: input.fromWarehouseId,
      toWarehouseId: input.toWarehouseId,
      notes: input.notes,
      requestedBy: context.session.user.id,
    }).returning();
    const items = await tx.insert(stockTransferItems).values(input.items.map((item) => ({
      organizationId: context.organizationId,
      transferId,
      variantId: item.variantId,
      requestedQuantity: item.quantity,
    }))).returning();
    return { transfer, items };
  });
}

export async function shipStockTransfer(id: string, context: ApiContext) {
  return db.transaction(async (tx) => {
    const [transfer] = await tx.select().from(stockTransfers).where(and(eq(stockTransfers.id, id), eq(stockTransfers.organizationId, context.organizationId))).limit(1);
    if (!transfer) throw new AppError("NOT_FOUND", "Stock transfer not found");
    if (transfer.status !== "draft") throw new AppError("CONFLICT", "Only draft transfers can be shipped");
    const items = await tx.select().from(stockTransferItems).where(eq(stockTransferItems.transferId, id));
    for (const item of items) {
      await postStockMovement(tx, {
        organizationId: context.organizationId,
        warehouseId: transfer.fromWarehouseId,
        variantId: item.variantId,
        quantity: -item.requestedQuantity,
        type: "transfer_out",
        referenceType: "stock_transfer",
        referenceId: id,
        actorUserId: context.session.user.id,
      });
    }
    const [updated] = await tx.update(stockTransfers).set({ status: "in_transit", shippedAt: new Date(), updatedAt: new Date() }).where(eq(stockTransfers.id, id)).returning();
    await tx.update(stockTransferItems).set({ shippedQuantity: stockTransferItems.requestedQuantity, updatedAt: new Date() }).where(eq(stockTransferItems.transferId, id));
    return updated;
  });
}

export async function receiveStockTransfer(id: string, context: ApiContext) {
  return db.transaction(async (tx) => {
    const [transfer] = await tx.select().from(stockTransfers).where(and(eq(stockTransfers.id, id), eq(stockTransfers.organizationId, context.organizationId))).limit(1);
    if (!transfer) throw new AppError("NOT_FOUND", "Stock transfer not found");
    if (transfer.status !== "in_transit") throw new AppError("CONFLICT", "Only in-transit transfers can be received");
    const items = await tx.select().from(stockTransferItems).where(eq(stockTransferItems.transferId, id));
    for (const item of items) {
      await postStockMovement(tx, {
        organizationId: context.organizationId,
        warehouseId: transfer.toWarehouseId,
        variantId: item.variantId,
        quantity: item.shippedQuantity,
        type: "transfer_in",
        referenceType: "stock_transfer",
        referenceId: id,
        actorUserId: context.session.user.id,
      });
    }
    const [updated] = await tx.update(stockTransfers).set({ status: "received", receivedAt: new Date(), receivedBy: context.session.user.id, updatedAt: new Date() }).where(eq(stockTransfers.id, id)).returning();
    await tx.update(stockTransferItems).set({ receivedQuantity: stockTransferItems.shippedQuantity, updatedAt: new Date() }).where(eq(stockTransferItems.transferId, id));
    return updated;
  });
}
