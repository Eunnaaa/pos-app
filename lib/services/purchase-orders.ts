import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { productVariants, purchaseOrderItems, purchaseOrders, suppliers, warehouses } from "@/db/schema";
import type { ApiContext } from "@/lib/api";
import { AppError } from "@/lib/server";

const positive = z.union([z.string().regex(/^\d+$/), z.number().int().positive().safe()]).transform(BigInt).refine((value) => value > 0n);
const amount = z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative().safe()]).transform(BigInt);

export const createPurchaseOrderSchema = z.object({
  branchId: z.string().uuid().optional(),
  warehouseId: z.string().uuid(),
  supplierId: z.string().uuid(),
  expectedDate: z.string().date().optional(),
  notes: z.string().max(1_000).optional(),
  status: z.enum(["draft", "submitted"]).default("submitted"),
  items: z.array(z.object({ variantId: z.string().uuid(), quantity: positive, unitCostAmount: amount })).min(1).max(500),
});

export async function createPurchaseOrder(input: z.infer<typeof createPurchaseOrderSchema>, context: ApiContext) {
  return db.transaction(async (tx) => {
    const [[supplier], [warehouse]] = await Promise.all([
      tx.select({ id: suppliers.id }).from(suppliers).where(and(eq(suppliers.id, input.supplierId), eq(suppliers.organizationId, context.organizationId))).limit(1),
      tx.select({ id: warehouses.id }).from(warehouses).where(and(eq(warehouses.id, input.warehouseId), eq(warehouses.organizationId, context.organizationId))).limit(1),
    ]);
    if (!supplier || !warehouse) throw new AppError("NOT_FOUND", "Supplier or warehouse not found");
    const variants = await Promise.all(input.items.map(async (item) => {
      const [variant] = await tx.select({ id: productVariants.id }).from(productVariants).where(and(eq(productVariants.id, item.variantId), eq(productVariants.organizationId, context.organizationId))).limit(1);
      if (!variant) throw new AppError("NOT_FOUND", "Product variant not found");
      return item;
    }));
    const totalAmount = variants.reduce((sum, item) => sum + item.quantity * item.unitCostAmount, 0n);
    const id = crypto.randomUUID();
    const orderNumber = `PO-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${id.slice(0, 8).toUpperCase()}`;
    const [order] = await tx.insert(purchaseOrders).values({
      id,
      organizationId: context.organizationId,
      branchId: input.branchId,
      warehouseId: input.warehouseId,
      supplierId: input.supplierId,
      orderNumber,
      status: input.status,
      expectedDate: input.expectedDate,
      subtotalAmount: totalAmount,
      totalAmount,
      notes: input.notes,
      createdBy: context.session.user.id,
    }).returning();
    const items = await tx.insert(purchaseOrderItems).values(variants.map((item) => ({
      organizationId: context.organizationId,
      purchaseOrderId: id,
      variantId: item.variantId,
      quantity: item.quantity,
      unitCostAmount: item.unitCostAmount,
      totalAmount: item.quantity * item.unitCostAmount,
    }))).returning();
    return { order, items };
  });
}

export async function getPurchaseOrder(id: string, context: ApiContext) {
  const [order] = await db.select().from(purchaseOrders).where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.organizationId, context.organizationId))).limit(1);
  if (!order) throw new AppError("NOT_FOUND", "Purchase order not found");
  const items = await db.select({
    id: purchaseOrderItems.id,
    variantId: purchaseOrderItems.variantId,
    quantity: purchaseOrderItems.quantity,
    receivedQuantity: purchaseOrderItems.receivedQuantity,
    unitCostAmount: purchaseOrderItems.unitCostAmount,
    totalAmount: purchaseOrderItems.totalAmount,
    sku: productVariants.sku,
    variantName: productVariants.name,
  }).from(purchaseOrderItems).innerJoin(productVariants, eq(productVariants.id, purchaseOrderItems.variantId)).where(eq(purchaseOrderItems.purchaseOrderId, id));
  return { order, items };
}
