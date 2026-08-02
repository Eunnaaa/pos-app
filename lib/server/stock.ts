import { and, eq, sql } from "drizzle-orm";
import { db, type Database } from "@/db";
import { productVariants, stockBalances, stockMovements, warehouses } from "@/db/schema";
import { AppError } from "./errors";

export type StockMutation = {
  organizationId: string;
  branchId?: string;
  warehouseId: string;
  variantId: string;
  quantity: bigint;
  type: "sale" | "return" | "purchase" | "adjustment" | "transfer_in" | "transfer_out" | "opname";
  unitCostAmount?: bigint;
  referenceType?: string;
  referenceId?: string;
  reason?: string;
  actorUserId?: string;
  allowNegative?: boolean;
};

export async function mutateStock(input: StockMutation, database: Database = db) {
  if (input.quantity === 0n) throw new AppError("VALIDATION_ERROR", "Stock movement quantity cannot be zero");

  return database.transaction(async (tx) => {
    const [[warehouse], [variant]] = await Promise.all([
      tx.select({ id: warehouses.id }).from(warehouses).where(and(eq(warehouses.id, input.warehouseId), eq(warehouses.organizationId, input.organizationId))).limit(1),
      tx.select({ id: productVariants.id }).from(productVariants).where(and(eq(productVariants.id, input.variantId), eq(productVariants.organizationId, input.organizationId))).limit(1),
    ]);
    if (!warehouse || !variant) throw new AppError("NOT_FOUND", "Warehouse or product variant not found in organization");

    const balanceId = crypto.randomUUID();
    const result = await tx.execute<{ id: string; before_quantity: string; after_quantity: string }>(sql`
      insert into ${stockBalances} (
        id, organization_id, warehouse_id, variant_id, on_hand, reserved, available,
        reorder_point, reorder_quantity, average_cost_amount, version, created_at, updated_at
      ) values (
        ${balanceId}, ${input.organizationId}, ${input.warehouseId}, ${input.variantId}, ${input.quantity}, 0,
        ${input.quantity}, 0, 0, ${input.unitCostAmount ?? 0n}, 0, now(), now()
      )
      on conflict (warehouse_id, variant_id) do update set
        on_hand = ${stockBalances.onHand} + ${input.quantity},
        available = ${stockBalances.available} + ${input.quantity},
        average_cost_amount = case when ${input.unitCostAmount ?? null} is null then ${stockBalances.averageCostAmount} else ${input.unitCostAmount ?? 0n} end,
        version = ${stockBalances.version} + 1,
        updated_at = now()
      where ${input.allowNegative === true} or ${stockBalances.onHand} + ${input.quantity} >= 0
      returning id, on_hand - ${input.quantity} as before_quantity, on_hand as after_quantity
    `);
    const balance = result.rows[0];
    if (!balance) throw new AppError("INSUFFICIENT_STOCK", "Insufficient stock for this movement");

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

    return { balanceId: balance.id, movement };
  });
}
