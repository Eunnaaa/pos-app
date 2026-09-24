import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { salesOrders, stockBalances, stockMovements, stockReservations } from "@/db/schema";
import { AppError } from "@/lib/server";
import { cacheDel } from "@/lib/redis";
import { ONLINE_RESERVATION_MS } from "@/lib/online-reservation-policy";
import type { DbTransaction } from "./stock-ledger";

type ReservableItem = {
  variantId: string;
  quantity: bigint;
  trackStock: boolean;
  allowNegativeStock: boolean;
};

type ReservationRow = {
  id: string;
  warehouse_id: string;
  variant_id: string;
  quantity: string;
};

export function reservationExpiresAt(metadata: Record<string, unknown> | null | undefined): Date | null {
  if (metadata?.stockReservationVersion !== 1 || typeof metadata.reservationExpiresAt !== "string") return null;
  const date = new Date(metadata.reservationExpiresAt);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function reserveOrderStock(tx: DbTransaction, input: {
  organizationId: string;
  warehouseId: string;
  orderId: string;
  expiresAt: Date;
  items: ReservableItem[];
}) {
  const combined = new Map<string, { quantity: bigint; allowNegative: boolean }>();
  for (const item of input.items) {
    if (!item.trackStock) continue;
    const existing = combined.get(item.variantId);
    combined.set(item.variantId, {
      quantity: (existing?.quantity ?? 0n) + item.quantity,
      allowNegative: item.allowNegativeStock,
    });
  }

  // A fixed variant order also prevents two multi-item checkouts from locking
  // balance rows in opposite order and deadlocking.
  for (const [variantId, item] of [...combined.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    await tx.insert(stockBalances).values({
      organizationId: input.organizationId,
      warehouseId: input.warehouseId,
      variantId,
    }).onConflictDoNothing({ target: [stockBalances.warehouseId, stockBalances.variantId] });

    const updated = await tx.execute(sql`
      update ${stockBalances}
      set reserved = ${stockBalances.reserved} + ${item.quantity},
          available = ${stockBalances.available} - ${item.quantity},
          version = ${stockBalances.version} + 1,
          updated_at = now()
      where organization_id = ${input.organizationId}
        and warehouse_id = ${input.warehouseId}
        and variant_id = ${variantId}
        and (${item.allowNegative} or ${stockBalances.available} >= ${item.quantity})
      returning id
    `);
    if (!updated.rows.length) throw new AppError("INSUFFICIENT_STOCK", "Stok tidak cukup untuk pesanan ini");

    await tx.insert(stockReservations).values({
      organizationId: input.organizationId,
      warehouseId: input.warehouseId,
      variantId,
      referenceType: "sales_order",
      referenceId: input.orderId,
      quantity: item.quantity,
      status: "active",
      expiresAt: input.expiresAt,
    });
  }
}

async function lockedOrderReservations(tx: DbTransaction, organizationId: string, orderId: string): Promise<ReservationRow[]> {
  const result = await tx.execute<ReservationRow>(sql`
    select id, warehouse_id, variant_id, quantity
    from ${stockReservations}
    where organization_id = ${organizationId}
      and reference_type = 'sales_order'
      and reference_id = ${orderId}
      and status = 'active'
    order by variant_id
    for update
  `);
  return result.rows;
}

export async function releaseOrderReservations(
  tx: DbTransaction,
  organizationId: string,
  orderId: string,
  status: "released" | "expired",
) {
  const rows = await lockedOrderReservations(tx, organizationId, orderId);
  for (const row of rows) {
    const quantity = BigInt(row.quantity);
    const updated = await tx.execute(sql`
      update ${stockBalances}
      set reserved = reserved - ${quantity},
          available = available + ${quantity},
          version = version + 1,
          updated_at = now()
      where organization_id = ${organizationId}
        and warehouse_id = ${row.warehouse_id}
        and variant_id = ${row.variant_id}
        and reserved >= ${quantity}
      returning id
    `);
    if (!updated.rows.length) throw new AppError("CONFLICT", "Saldo reservasi stok tidak konsisten");
    await tx.update(stockReservations).set({ status, updatedAt: new Date() }).where(eq(stockReservations.id, row.id));
  }
  return rows.length;
}

export async function fulfillOrderReservations(tx: DbTransaction, input: {
  organizationId: string;
  branchId: string;
  orderId: string;
  actorUserId: string | null;
  itemCosts: Map<string, { costAmount: bigint; allowNegativeStock: boolean; quantity: bigint }>;
}) {
  const rows = await lockedOrderReservations(tx, input.organizationId, input.orderId);
  if (rows.length !== input.itemCosts.size) {
    throw new AppError("CONFLICT", "Reservasi stok pesanan tidak lengkap");
  }
  for (const row of rows) {
    const quantity = BigInt(row.quantity);
    const item = input.itemCosts.get(row.variant_id);
    if (!item || quantity !== item.quantity) throw new AppError("CONFLICT", "Jumlah reservasi stok tidak cocok dengan pesanan");
    const result = await tx.execute<{ before_quantity: string; after_quantity: string }>(sql`
      update ${stockBalances}
      set on_hand = on_hand - ${quantity},
          reserved = reserved - ${quantity},
          version = version + 1,
          updated_at = now()
      where organization_id = ${input.organizationId}
        and warehouse_id = ${row.warehouse_id}
        and variant_id = ${row.variant_id}
        and reserved >= ${quantity}
        and (${item.allowNegativeStock} or on_hand >= ${quantity})
      returning on_hand + ${quantity} as before_quantity, on_hand as after_quantity
    `);
    const balance = result.rows[0];
    if (!balance) throw new AppError("INSUFFICIENT_STOCK", "Saldo stok yang dicadangkan tidak konsisten");
    await tx.insert(stockMovements).values({
      organizationId: input.organizationId,
      branchId: input.branchId,
      warehouseId: row.warehouse_id,
      variantId: row.variant_id,
      type: "sale",
      quantity: -quantity,
      beforeQuantity: BigInt(balance.before_quantity),
      afterQuantity: BigInt(balance.after_quantity),
      unitCostAmount: item.costAmount,
      referenceType: "sales_order",
      referenceId: input.orderId,
      actorUserId: input.actorUserId ?? undefined,
    });
    await tx.update(stockReservations).set({ status: "fulfilled", updatedAt: new Date() }).where(eq(stockReservations.id, row.id));
  }
  return rows.length;
}

export async function assertOnlineOrderReservable(orderId: string) {
  const [order] = await db.select({ status: salesOrders.status, metadata: salesOrders.metadata })
    .from(salesOrders).where(eq(salesOrders.id, orderId)).limit(1);
  const expiry = reservationExpiresAt(order?.metadata);
  if (!order || order.status !== "pending" || !expiry || expiry.getTime() <= Date.now() + 60_000) {
    throw new AppError("CONFLICT", "Batas waktu reservasi stok telah habis. Buat pesanan baru.");
  }
  return expiry;
}

export async function expirePendingOnlineOrders(limit = 100) {
  const due = await db.execute<{ id: string }>(sql`
    select id from ${salesOrders}
    where (
      (status in ('pending', 'cancelled')
        and metadata->>'stockReservationVersion' = '1'
        and (metadata->>'reservationExpiresAt')::timestamptz <= now()
        and (status = 'pending' or exists (
          select 1 from ${stockReservations} sr
          where sr.reference_type = 'sales_order' and sr.reference_id = ${salesOrders}.id and sr.status = 'active'
        )))
      or (status = 'pending' and channel in ('self_order', 'kiosk')
        and coalesce(metadata->>'stockReservationVersion', '') <> '1'
        and created_at < now() - interval '15 minutes')
    )
    order by created_at
    limit ${limit}
  `);
  let expired = 0;
  for (const { id } of due.rows) {
    const changed = await db.transaction(async (tx) => {
      const locked = await tx.execute<{ id: string; organization_id: string; branch_id: string; warehouse_id: string; status: string; channel: string; created_at: Date; metadata: Record<string, unknown> }>(sql`
        select id, organization_id, branch_id, warehouse_id, status, channel, created_at, metadata
        from ${salesOrders} where id = ${id} for update
      `);
      const order = locked.rows[0];
      const expiry = reservationExpiresAt(order?.metadata);
      const legacyExpired = order?.status === "pending"
        && (order.channel === "self_order" || order.channel === "kiosk")
        && !expiry && order.created_at.getTime() <= Date.now() - ONLINE_RESERVATION_MS;
      if (!order || !["pending", "cancelled"].includes(order.status)
        || (!legacyExpired && (!expiry || expiry.getTime() > Date.now()))) return null;
      if (expiry) await releaseOrderReservations(tx, order.organization_id, order.id, "expired");
      if (order.status === "pending") {
        await tx.update(salesOrders).set({ status: "cancelled", updatedAt: new Date() }).where(eq(salesOrders.id, id));
      }
      return order;
    });
    if (changed) {
      expired += 1;
      void cacheDel(`tenant:${changed.organization_id}:branch:${changed.branch_id}:warehouse:${changed.warehouse_id}:pos-bootstrap`);
    }
  }
  return expired;
}
