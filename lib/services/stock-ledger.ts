import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { productVariants, stockBalances, stockMovements, warehouses } from "@/db/schema";
import { AppError } from "@/lib/server";

export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type LedgerStockInput = {
  organizationId: string;
  branchId?: string;
  warehouseId: string;
  variantId: string;
  quantity: bigint;
  type: "sale" | "return" | "purchase" | "adjustment" | "transfer_in" | "transfer_out" | "reservation" | "release" | "opname";
  referenceType?: string;
  referenceId?: string;
  unitCostAmount?: bigint;
  reason?: string;
  actorUserId?: string;
  allowNegative?: boolean;
};

export async function postStockMovement(tx: DbTransaction, input: LedgerStockInput) {
  if (input.quantity === 0n) throw new AppError("VALIDATION_ERROR", "Stock movement quantity cannot be zero");

  const [[warehouse], [variant]] = await Promise.all([
    tx.select({ id: warehouses.id, branchId: warehouses.branchId }).from(warehouses).where(and(eq(warehouses.id, input.warehouseId), eq(warehouses.organizationId, input.organizationId))).limit(1),
    tx.select({ id: productVariants.id }).from(productVariants).where(and(eq(productVariants.id, input.variantId), eq(productVariants.organizationId, input.organizationId))).limit(1),
  ]);
  if (!warehouse || !variant) throw new AppError("NOT_FOUND", "Warehouse or product variant not found in organization");
  if (input.branchId && warehouse.branchId && input.branchId !== warehouse.branchId) {
    throw new AppError("FORBIDDEN", "Warehouse does not belong to branch");
  }

  await tx
    .insert(stockBalances)
    .values({ organizationId: input.organizationId, warehouseId: input.warehouseId, variantId: input.variantId })
    .onConflictDoNothing({ target: [stockBalances.warehouseId, stockBalances.variantId] });

  const result = await tx.execute<{ id: string; before_quantity: string; after_quantity: string }>(sql`
    update ${stockBalances}
    set on_hand = ${stockBalances.onHand} + ${input.quantity},
        available = ${stockBalances.available} + ${input.quantity},
        average_cost_amount = case
          when ${input.unitCostAmount ?? null}::bigint is null then ${stockBalances.averageCostAmount}
          else ${input.unitCostAmount ?? 0n}
        end,
        version = ${stockBalances.version} + 1,
        updated_at = now()
    where organization_id = ${input.organizationId}
      and warehouse_id = ${input.warehouseId}
      and variant_id = ${input.variantId}
      and (${input.allowNegative === true} or (${stockBalances.onHand} + ${input.quantity} >= 0 and ${stockBalances.available} + ${input.quantity} >= 0))
    returning id, on_hand - ${input.quantity} as before_quantity, on_hand as after_quantity
  `);
  const balance = result.rows[0];
  if (!balance) throw new AppError("INSUFFICIENT_STOCK", "Insufficient available stock");

  const [movement] = await tx
    .insert(stockMovements)
    .values({
      organizationId: input.organizationId,
      branchId: input.branchId,
      warehouseId: input.warehouseId,
      variantId: input.variantId,
      type: input.type,
      quantity: input.quantity,
      beforeQuantity: BigInt(balance.before_quantity),
      afterQuantity: BigInt(balance.after_quantity),
      unitCostAmount: input.unitCostAmount ?? 0n,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      reason: input.reason,
      actorUserId: input.actorUserId,
    })
    .returning();

  return movement;
}
