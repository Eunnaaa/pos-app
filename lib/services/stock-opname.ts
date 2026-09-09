import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db";
import { db } from "@/db";
import {
  categories,
  products,
  productVariants,
  stockBalances,
  stockCountItems,
  stockCounts,
  user,
  warehouses,
} from "@/db/schema";
import type { ApiContext } from "@/lib/api";
import { AppError } from "@/lib/server";
import { writeAuditLog } from "@/lib/server/audit";
import { postStockMovement } from "./stock-ledger";

export const createStockOpnameSchema = z.object({
  warehouseId: z.string().uuid(),
  notes: z.string().max(1000).optional(),
  categoryId: z.string().uuid().optional(),
  variantIds: z.array(z.string().uuid()).optional(),
});

export const updateStockOpnameItemSchema = z.object({
  variantId: z.string().uuid(),
  countedQuantity: z.union([z.string().regex(/^\d+$/), z.number().int().min(0)]).transform(BigInt),
  reason: z.string().max(500).optional().nullable(),
});

export const updateStockOpnameSchema = z.object({
  notes: z.string().max(1000).optional(),
  items: z.array(updateStockOpnameItemSchema).min(1),
});

export const completeStockOpnameSchema = z.object({
  notes: z.string().max(1000).optional(),
});

/**
 * Creates a new Stock Opname session and snapshots current on-hand stock balances.
 */
export async function createStockOpname(
  input: z.infer<typeof createStockOpnameSchema>,
  context: ApiContext,
) {
  return db.transaction(async (tx) => {
    // 1. Verify warehouse belongs to organization
    const [warehouse] = await tx
      .select({ id: warehouses.id, name: warehouses.name, branchId: warehouses.branchId })
      .from(warehouses)
      .where(
        and(
          eq(warehouses.id, input.warehouseId),
          eq(warehouses.organizationId, context.organizationId),
        ),
      )
      .limit(1);

    if (!warehouse) {
      throw new AppError("NOT_FOUND", "Gudang tidak ditemukan");
    }

    // 2. Query target variants that track stock
    const variantQuery = tx
      .select({
        id: productVariants.id,
        name: productVariants.name,
        sku: productVariants.sku,
        costAmount: productVariants.costAmount,
        productName: products.name,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(
        and(
          eq(productVariants.organizationId, context.organizationId),
          eq(products.trackStock, true),
          eq(products.isActive, true),
          input.categoryId ? eq(products.categoryId, input.categoryId) : undefined,
          input.variantIds?.length ? inArray(productVariants.id, input.variantIds) : undefined,
        ),
      );

    const targetVariants = await variantQuery;
    if (!targetVariants.length) {
      throw new AppError("VALIDATION_ERROR", "Tidak ada produk aktif yang melacak stok untuk di-opname");
    }

    // 3. Query existing stock balances for these variants in the warehouse
    const existingBalances = await tx
      .select({
        variantId: stockBalances.variantId,
        onHand: stockBalances.onHand,
      })
      .from(stockBalances)
      .where(
        and(
          eq(stockBalances.organizationId, context.organizationId),
          eq(stockBalances.warehouseId, input.warehouseId),
        ),
      );

    const balanceMap = new Map<string, bigint>(
      existingBalances.map((b) => [b.variantId, b.onHand ?? 0n]),
    );

    // 4. Insert stock count header
    const countId = crypto.randomUUID();
    const countNumber = `SO-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${countId.slice(0, 8).toUpperCase()}`;

    const [count] = await tx
      .insert(stockCounts)
      .values({
        id: countId,
        organizationId: context.organizationId,
        warehouseId: input.warehouseId,
        countNumber,
        status: "counting",
        notes: input.notes,
        countedBy: context.session.user.id,
      })
      .returning();

    // 5. Insert count item rows with snapshot expected quantities
    await tx.insert(stockCountItems).values(
      targetVariants.map((v) => {
        const expected = balanceMap.get(v.id) ?? 0n;
        return {
          organizationId: context.organizationId,
          stockCountId: countId,
          variantId: v.id,
          expectedQuantity: expected,
          countedQuantity: expected,
          varianceQuantity: 0n,
          reason: null,
        };
      }),
    );

    await writeAuditLog(
      {
        organizationId: context.organizationId,
        branchId: warehouse.branchId ?? undefined,
        actorUserId: context.session.user.id,
        action: "inventory.opname.create",
        resourceType: "stock_count",
        resourceId: countId,
        after: { countNumber, warehouseId: input.warehouseId, itemCount: targetVariants.length },
      },
      tx as unknown as Database,
    );

    return count;
  });
}

/**
 * Updates counted quantities and variance notes for a Stock Opname session.
 */
export async function updateStockOpnameCounts(
  id: string,
  input: z.infer<typeof updateStockOpnameSchema>,
  context: ApiContext,
) {
  return db.transaction(async (tx) => {
    const [count] = await tx
      .select()
      .from(stockCounts)
      .where(and(eq(stockCounts.id, id), eq(stockCounts.organizationId, context.organizationId)))
      .limit(1);

    if (!count) throw new AppError("NOT_FOUND", "Sesi Stock Opname tidak ditemukan");
    if (count.status === "completed" || count.status === "cancelled") {
      throw new AppError("CONFLICT", "Sesi Stock Opname sudah selesai atau dibatalkan");
    }

    if (input.notes !== undefined) {
      await tx
        .update(stockCounts)
        .set({ notes: input.notes, updatedAt: new Date() })
        .where(eq(stockCounts.id, id));
    }

    for (const item of input.items) {
      const [existing] = await tx
        .select({ expectedQuantity: stockCountItems.expectedQuantity })
        .from(stockCountItems)
        .where(
          and(
            eq(stockCountItems.stockCountId, id),
            eq(stockCountItems.variantId, item.variantId),
            eq(stockCountItems.organizationId, context.organizationId),
          ),
        )
        .limit(1);

      if (existing) {
        const expected = existing.expectedQuantity ?? 0n;
        const variance = item.countedQuantity - expected;
        await tx
          .update(stockCountItems)
          .set({
            countedQuantity: item.countedQuantity,
            varianceQuantity: variance,
            reason: item.reason ?? null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(stockCountItems.stockCountId, id),
              eq(stockCountItems.variantId, item.variantId),
            ),
          );
      }
    }

    return { success: true };
  });
}

/**
 * Completes a Stock Opname session:
 * Generates stock movements for variances and applies adjustments directly to stockBalances.
 */
export async function completeStockOpname(
  id: string,
  input: z.infer<typeof completeStockOpnameSchema>,
  context: ApiContext,
) {
  return db.transaction(async (tx) => {
    const [count] = await tx
      .select({
        id: stockCounts.id,
        organizationId: stockCounts.organizationId,
        warehouseId: stockCounts.warehouseId,
        countNumber: stockCounts.countNumber,
        status: stockCounts.status,
      })
      .from(stockCounts)
      .where(and(eq(stockCounts.id, id), eq(stockCounts.organizationId, context.organizationId)))
      .limit(1);

    if (!count) throw new AppError("NOT_FOUND", "Sesi Stock Opname tidak ditemukan");
    if (count.status === "completed") {
      throw new AppError("CONFLICT", "Sesi Stock Opname sudah selesai");
    }
    if (count.status === "cancelled") {
      throw new AppError("CONFLICT", "Sesi Stock Opname telah dibatalkan");
    }

    const items = await tx
      .select({
        id: stockCountItems.id,
        variantId: stockCountItems.variantId,
        expectedQuantity: stockCountItems.expectedQuantity,
        countedQuantity: stockCountItems.countedQuantity,
        varianceQuantity: stockCountItems.varianceQuantity,
        reason: stockCountItems.reason,
        costAmount: productVariants.costAmount,
      })
      .from(stockCountItems)
      .innerJoin(productVariants, eq(productVariants.id, stockCountItems.variantId))
      .where(eq(stockCountItems.stockCountId, id));

    let totalVarianceQty = 0n;
    let totalVarianceValue = 0n;
    let adjustedItemCount = 0;

    for (const item of items) {
      const effectiveCounted = item.countedQuantity ?? item.expectedQuantity ?? 0n;
      const expected = item.expectedQuantity ?? 0n;
      const variance = effectiveCounted - expected;

      if (variance !== 0n) {
        adjustedItemCount++;
        totalVarianceQty += variance;
        totalVarianceValue += variance * (item.costAmount ?? 0n);

        await postStockMovement(tx, {
          organizationId: context.organizationId,
          warehouseId: count.warehouseId,
          variantId: item.variantId,
          quantity: variance,
          type: "opname",
          referenceType: "stock_count",
          referenceId: count.id,
          unitCostAmount: item.costAmount ?? undefined,
          reason: item.reason || `Penyesuaian Opname ${count.countNumber}`,
          actorUserId: context.session.user.id,
          allowNegative: true, // Opname reflects ground truth
        });
      }
    }

    const [updatedCount] = await tx
      .update(stockCounts)
      .set({
        status: "completed",
        notes: input.notes ?? undefined,
        countedBy: context.session.user.id,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(stockCounts.id, id))
      .returning();

    await writeAuditLog(
      {
        organizationId: context.organizationId,
        actorUserId: context.session.user.id,
        action: "inventory.opname.complete",
        resourceType: "stock_count",
        resourceId: id,
        after: {
          countNumber: count.countNumber,
          adjustedItemCount,
          totalVarianceQty: totalVarianceQty.toString(),
          totalVarianceValue: totalVarianceValue.toString(),
        },
      },
      tx as unknown as Database,
    );

    return {
      stockCount: updatedCount,
      summary: {
        totalItems: items.length,
        adjustedItemCount,
        totalVarianceQty: totalVarianceQty.toString(),
        totalVarianceValue: totalVarianceValue.toString(),
      },
    };
  });
}

/**
 * Cancels a Stock Opname session.
 */
export async function cancelStockOpname(id: string, context: ApiContext) {
  return db.transaction(async (tx) => {
    const [count] = await tx
      .select()
      .from(stockCounts)
      .where(and(eq(stockCounts.id, id), eq(stockCounts.organizationId, context.organizationId)))
      .limit(1);

    if (!count) throw new AppError("NOT_FOUND", "Sesi Stock Opname tidak ditemukan");
    if (count.status === "completed") {
      throw new AppError("CONFLICT", "Sesi Stock Opname yang sudah selesai tidak dapat dibatalkan");
    }

    const [updated] = await tx
      .update(stockCounts)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(stockCounts.id, id))
      .returning();

    await writeAuditLog(
      {
        organizationId: context.organizationId,
        actorUserId: context.session.user.id,
        action: "inventory.opname.cancel",
        resourceType: "stock_count",
        resourceId: id,
        after: { countNumber: count.countNumber, status: "cancelled" },
      },
      tx as unknown as Database,
    );

    return updated;
  });
}

/**
 * Lists all Stock Opname sessions for the organization.
 */
export async function listStockOpnames(context: ApiContext, warehouseId?: string) {
  const counts = await db
    .select({
      id: stockCounts.id,
      countNumber: stockCounts.countNumber,
      status: stockCounts.status,
      notes: stockCounts.notes,
      warehouseId: stockCounts.warehouseId,
      warehouseName: warehouses.name,
      countedBy: stockCounts.countedBy,
      userName: user.name,
      completedAt: stockCounts.completedAt,
      createdAt: stockCounts.createdAt,
      updatedAt: stockCounts.updatedAt,
      itemCount: sql<number>`count(${stockCountItems.id})::int`,
      varianceCount: sql<number>`count(case when ${stockCountItems.varianceQuantity} <> 0 then 1 end)::int`,
    })
    .from(stockCounts)
    .innerJoin(warehouses, eq(warehouses.id, stockCounts.warehouseId))
    .leftJoin(user, eq(user.id, stockCounts.countedBy))
    .leftJoin(stockCountItems, eq(stockCountItems.stockCountId, stockCounts.id))
    .where(
      and(
        eq(stockCounts.organizationId, context.organizationId),
        warehouseId ? eq(stockCounts.warehouseId, warehouseId) : undefined,
      ),
    )
    .groupBy(
      stockCounts.id,
      warehouses.name,
      user.name,
    )
    .orderBy(desc(stockCounts.createdAt));

  return counts;
}

/**
 * Gets detail of a Stock Opname session including all items with variance and product metadata.
 */
export async function getStockOpnameDetail(id: string, context: ApiContext) {
  const [count] = await db
    .select({
      id: stockCounts.id,
      countNumber: stockCounts.countNumber,
      status: stockCounts.status,
      notes: stockCounts.notes,
      warehouseId: stockCounts.warehouseId,
      warehouseName: warehouses.name,
      countedBy: stockCounts.countedBy,
      userName: user.name,
      completedAt: stockCounts.completedAt,
      createdAt: stockCounts.createdAt,
      updatedAt: stockCounts.updatedAt,
    })
    .from(stockCounts)
    .innerJoin(warehouses, eq(warehouses.id, stockCounts.warehouseId))
    .leftJoin(user, eq(user.id, stockCounts.countedBy))
    .where(and(eq(stockCounts.id, id), eq(stockCounts.organizationId, context.organizationId)))
    .limit(1);

  if (!count) throw new AppError("NOT_FOUND", "Sesi Stock Opname tidak ditemukan");

  const items = await db
    .select({
      id: stockCountItems.id,
      variantId: stockCountItems.variantId,
      productName: products.name,
      variantName: productVariants.name,
      sku: productVariants.sku,
      barcode: productVariants.barcode,
      categoryName: categories.name,
      costAmount: productVariants.costAmount,
      expectedQuantity: stockCountItems.expectedQuantity,
      countedQuantity: stockCountItems.countedQuantity,
      varianceQuantity: stockCountItems.varianceQuantity,
      reason: stockCountItems.reason,
    })
    .from(stockCountItems)
    .innerJoin(productVariants, eq(productVariants.id, stockCountItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(eq(stockCountItems.stockCountId, id))
    .orderBy(products.name, productVariants.name);

  // Calculate summary metrics
  let totalExpected = 0n;
  let totalCounted = 0n;
  let totalVarianceQty = 0n;
  let totalVarianceValue = 0n;
  let matchedItems = 0;
  let varianceItems = 0;
  let uncountedItems = 0;

  for (const item of items) {
    const exp = item.expectedQuantity ?? 0n;
    totalExpected += exp;
    if (item.countedQuantity !== null) {
      const cnt = item.countedQuantity;
      totalCounted += cnt;
      const diff = cnt - exp;
      totalVarianceQty += diff;
      totalVarianceValue += diff * (item.costAmount ?? 0n);
      if (diff === 0n) matchedItems++;
      else varianceItems++;
    } else {
      uncountedItems++;
    }
  }

  return {
    ...count,
    summary: {
      totalItems: items.length,
      matchedItems,
      varianceItems,
      uncountedItems,
      totalExpected: totalExpected.toString(),
      totalCounted: totalCounted.toString(),
      totalVarianceQty: totalVarianceQty.toString(),
      totalVarianceValue: totalVarianceValue.toString(),
    },
    items: items.map((i) => ({
      ...i,
      expectedQuantity: i.expectedQuantity?.toString() ?? "0",
      countedQuantity: i.countedQuantity?.toString() ?? null,
      varianceQuantity: i.varianceQuantity?.toString() ?? null,
      costAmount: i.costAmount?.toString() ?? "0",
      displayName: `${i.productName}${i.variantName === "Default" ? "" : ` - ${i.variantName}`}`,
    })),
  };
}
