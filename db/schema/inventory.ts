import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { productVariants } from "./catalog";
import { idColumn, moneyColumn, quantityColumn, timestamps } from "./helpers";
import { branches, organizations, warehouses } from "./tenancy";

export const stockBalances = pgTable(
  "stock_balances",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    warehouseId: uuid("warehouse_id").notNull().references(() => warehouses.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").notNull().references(() => productVariants.id, { onDelete: "cascade" }),
    onHand: quantityColumn("on_hand"),
    reserved: quantityColumn("reserved"),
    available: quantityColumn("available"),
    reorderPoint: quantityColumn("reorder_point"),
    reorderQuantity: quantityColumn("reorder_quantity"),
    averageCostAmount: moneyColumn("average_cost_amount"),
    version: quantityColumn("version"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("stock_balances_warehouse_variant_uidx").on(table.warehouseId, table.variantId),
    index("stock_balances_org_variant_idx").on(table.organizationId, table.variantId),
    check("stock_balances_reserved_nonnegative", sql`${table.reserved} >= 0`),
  ],
);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    warehouseId: uuid("warehouse_id").notNull().references(() => warehouses.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id").notNull().references(() => productVariants.id, { onDelete: "restrict" }),
    type: text("type").$type<"sale" | "return" | "purchase" | "adjustment" | "transfer_in" | "transfer_out" | "reservation" | "release" | "opname">().notNull(),
    quantity: quantityColumn("quantity"),
    beforeQuantity: quantityColumn("before_quantity"),
    afterQuantity: quantityColumn("after_quantity"),
    unitCostAmount: moneyColumn("unit_cost_amount"),
    referenceType: text("reference_type"),
    referenceId: uuid("reference_id"),
    reason: text("reason"),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    ...timestamps(),
  },
  (table) => [
    index("stock_movements_org_variant_time_idx").on(table.organizationId, table.variantId, table.occurredAt),
    index("stock_movements_reference_idx").on(table.referenceType, table.referenceId),
    check("stock_movements_nonzero_quantity", sql`${table.quantity} <> 0`),
  ],
);

export const stockReservations = pgTable(
  "stock_reservations",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    warehouseId: uuid("warehouse_id").notNull().references(() => warehouses.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").notNull().references(() => productVariants.id, { onDelete: "cascade" }),
    referenceType: text("reference_type").notNull(),
    referenceId: uuid("reference_id").notNull(),
    quantity: quantityColumn("quantity"),
    status: text("status").$type<"active" | "fulfilled" | "released" | "expired">().default("active").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index("stock_reservations_lookup_idx").on(table.organizationId, table.referenceType, table.referenceId),
    check("stock_reservations_positive_quantity", sql`${table.quantity} > 0`),
  ],
);

export const inventoryBatches = pgTable(
  "inventory_batches",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    warehouseId: uuid("warehouse_id").notNull().references(() => warehouses.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").notNull().references(() => productVariants.id, { onDelete: "cascade" }),
    batchNumber: text("batch_number").notNull(),
    expiryDate: date("expiry_date"),
    quantity: quantityColumn("quantity"),
    costAmount: moneyColumn("cost_amount"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("inventory_batches_warehouse_variant_batch_uidx").on(table.warehouseId, table.variantId, table.batchNumber),
    index("inventory_batches_expiry_idx").on(table.organizationId, table.expiryDate),
  ],
);

export const inventorySerials = pgTable(
  "inventory_serials",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    warehouseId: uuid("warehouse_id").references(() => warehouses.id, { onDelete: "set null" }),
    variantId: uuid("variant_id").notNull().references(() => productVariants.id, { onDelete: "restrict" }),
    serialNumber: text("serial_number").notNull(),
    status: text("status").$type<"in_stock" | "reserved" | "sold" | "returned" | "damaged">().default("in_stock").notNull(),
    ...timestamps(),
  },
  (table) => [uniqueIndex("inventory_serials_org_serial_uidx").on(table.organizationId, table.serialNumber)],
);

export const stockTransfers = pgTable(
  "stock_transfers",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    transferNumber: text("transfer_number").notNull(),
    fromWarehouseId: uuid("from_warehouse_id").notNull().references(() => warehouses.id, { onDelete: "restrict" }),
    toWarehouseId: uuid("to_warehouse_id").notNull().references(() => warehouses.id, { onDelete: "restrict" }),
    status: text("status").$type<"draft" | "in_transit" | "received" | "cancelled">().default("draft").notNull(),
    notes: text("notes"),
    requestedBy: text("requested_by").references(() => user.id, { onDelete: "set null" }),
    receivedBy: text("received_by").references(() => user.id, { onDelete: "set null" }),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [uniqueIndex("stock_transfers_org_number_uidx").on(table.organizationId, table.transferNumber)],
);

export const stockTransferItems = pgTable(
  "stock_transfer_items",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    transferId: uuid("transfer_id").notNull().references(() => stockTransfers.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").notNull().references(() => productVariants.id, { onDelete: "restrict" }),
    requestedQuantity: quantityColumn("requested_quantity"),
    shippedQuantity: quantityColumn("shipped_quantity"),
    receivedQuantity: quantityColumn("received_quantity"),
    ...timestamps(),
  },
  (table) => [uniqueIndex("stock_transfer_items_transfer_variant_uidx").on(table.transferId, table.variantId)],
);

export const stockCounts = pgTable(
  "stock_counts",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    warehouseId: uuid("warehouse_id").notNull().references(() => warehouses.id, { onDelete: "restrict" }),
    countNumber: text("count_number").notNull(),
    status: text("status").$type<"draft" | "counting" | "completed" | "cancelled">().default("draft").notNull(),
    notes: text("notes"),
    countedBy: text("counted_by").references(() => user.id, { onDelete: "set null" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [uniqueIndex("stock_counts_org_number_uidx").on(table.organizationId, table.countNumber)],
);

export const stockCountItems = pgTable(
  "stock_count_items",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    stockCountId: uuid("stock_count_id").notNull().references(() => stockCounts.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").notNull().references(() => productVariants.id, { onDelete: "restrict" }),
    expectedQuantity: quantityColumn("expected_quantity"),
    countedQuantity: quantityColumn("counted_quantity"),
    varianceQuantity: quantityColumn("variance_quantity"),
    reason: text("reason"),
    ...timestamps(),
  },
  (table) => [uniqueIndex("stock_count_items_count_variant_uidx").on(table.stockCountId, table.variantId)],
);
