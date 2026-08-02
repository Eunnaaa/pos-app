import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { productVariants, taxRates } from "./catalog";
import { cashRegisterSessions } from "./finance";
import { idColumn, moneyColumn, quantityColumn, timestamps, type JsonValue } from "./helpers";
import { customers, promotions } from "./parties";
import { branches, organizations, warehouses } from "./tenancy";

export const salesOrders = pgTable(
  "sales_orders",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").notNull().references(() => branches.id, { onDelete: "restrict" }),
    warehouseId: uuid("warehouse_id").notNull().references(() => warehouses.id, { onDelete: "restrict" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    cashierUserId: text("cashier_user_id").references(() => user.id, { onDelete: "set null" }),
    cashSessionId: uuid("cash_session_id").references(() => cashRegisterSessions.id, { onDelete: "restrict" }),
    parentOrderId: uuid("parent_order_id"),
    orderNumber: text("order_number").notNull(),
    type: text("type").$type<"sale" | "quotation" | "invoice">().default("sale").notNull(),
    status: text("status").$type<"draft" | "held" | "pending" | "confirmed" | "paid" | "partially_refunded" | "refunded" | "cancelled">().default("draft").notNull(),
    channel: text("channel").default("pos").notNull(),
    subtotalAmount: moneyColumn("subtotal_amount"),
    discountAmount: moneyColumn("discount_amount"),
    taxAmount: moneyColumn("tax_amount"),
    serviceChargeAmount: moneyColumn("service_charge_amount"),
    totalAmount: moneyColumn("total_amount"),
    paidAmount: moneyColumn("paid_amount"),
    changeAmount: moneyColumn("change_amount"),
    costAmount: moneyColumn("cost_amount"),
    notes: text("notes"),
    offlineReference: text("offline_reference"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, JsonValue>>().default({}),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("sales_orders_org_number_uidx").on(table.organizationId, table.orderNumber),
    uniqueIndex("sales_orders_org_offline_ref_uidx").on(table.organizationId, table.offlineReference).where(sql`${table.offlineReference} is not null`),
    index("sales_orders_org_branch_time_idx").on(table.organizationId, table.branchId, table.occurredAt),
    index("sales_orders_customer_idx").on(table.customerId),
    check("sales_orders_nonnegative_total", sql`${table.totalAmount} >= 0`),
  ],
);

export const salesOrderItems = pgTable(
  "sales_order_items",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").notNull().references(() => salesOrders.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "restrict" }),
    taxRateId: uuid("tax_rate_id").references(() => taxRates.id, { onDelete: "set null" }),
    itemName: text("item_name").notNull(),
    sku: text("sku"),
    quantity: quantityColumn("quantity"),
    unitPriceAmount: moneyColumn("unit_price_amount"),
    unitCostAmount: moneyColumn("unit_cost_amount"),
    discountAmount: moneyColumn("discount_amount"),
    taxAmount: moneyColumn("tax_amount"),
    totalAmount: moneyColumn("total_amount"),
    notes: text("notes"),
    ...timestamps(),
  },
  (table) => [
    index("sales_order_items_order_idx").on(table.orderId),
    check("sales_order_items_positive_quantity", sql`${table.quantity} > 0`),
  ],
);

export const orderPromotions = pgTable(
  "order_promotions",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").notNull().references(() => salesOrders.id, { onDelete: "cascade" }),
    promotionId: uuid("promotion_id").references(() => promotions.id, { onDelete: "set null" }),
    code: text("code"),
    discountAmount: moneyColumn("discount_amount"),
    ...timestamps(),
  },
  (table) => [index("order_promotions_order_idx").on(table.orderId)],
);

export const salesPayments = pgTable(
  "sales_payments",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").notNull().references(() => salesOrders.id, { onDelete: "restrict" }),
    method: text("method").$type<"cash" | "debit" | "credit" | "qris" | "e_wallet" | "transfer" | "pay_later" | "store_credit">().notNull(),
    provider: text("provider"),
    amount: moneyColumn("amount"),
    status: text("status").$type<"pending" | "authorized" | "settled" | "failed" | "voided" | "refunded">().default("pending").notNull(),
    externalReference: text("external_reference"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, JsonValue>>().default({}),
    ...timestamps(),
  },
  (table) => [
    index("sales_payments_order_idx").on(table.orderId),
    uniqueIndex("sales_payments_org_external_ref_uidx").on(table.organizationId, table.externalReference).where(sql`${table.externalReference} is not null`),
    check("sales_payments_positive_amount", sql`${table.amount} > 0`),
  ],
);

export const salesReturns = pgTable(
  "sales_returns",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").notNull().references(() => branches.id, { onDelete: "restrict" }),
    orderId: uuid("order_id").notNull().references(() => salesOrders.id, { onDelete: "restrict" }),
    returnNumber: text("return_number").notNull(),
    status: text("status").$type<"draft" | "approved" | "refunded" | "rejected">().default("draft").notNull(),
    reason: text("reason").notNull(),
    totalAmount: moneyColumn("total_amount"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    approvedBy: text("approved_by").references(() => user.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (table) => [uniqueIndex("sales_returns_org_number_uidx").on(table.organizationId, table.returnNumber)],
);

export const salesReturnItems = pgTable(
  "sales_return_items",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    returnId: uuid("return_id").notNull().references(() => salesReturns.id, { onDelete: "cascade" }),
    orderItemId: uuid("order_item_id").notNull().references(() => salesOrderItems.id, { onDelete: "restrict" }),
    quantity: quantityColumn("quantity"),
    refundAmount: moneyColumn("refund_amount"),
    restock: boolean("restock").default(true).notNull(),
    ...timestamps(),
  },
  (table) => [check("sales_return_items_positive_quantity", sql`${table.quantity} > 0`)],
);

export const refunds = pgTable(
  "refunds",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    returnId: uuid("return_id").notNull().references(() => salesReturns.id, { onDelete: "restrict" }),
    paymentId: uuid("payment_id").references(() => salesPayments.id, { onDelete: "set null" }),
    amount: moneyColumn("amount"),
    status: text("status").$type<"pending" | "processed" | "failed">().default("pending").notNull(),
    externalReference: text("external_reference"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [index("refunds_return_idx").on(table.returnId)],
);

export const receipts = pgTable(
  "receipts",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").notNull().references(() => salesOrders.id, { onDelete: "cascade" }),
    verificationToken: text("verification_token").notNull(),
    pdfUrl: text("pdf_url"),
    emailSentAt: timestamp("email_sent_at", { withTimezone: true }),
    whatsappSentAt: timestamp("whatsapp_sent_at", { withTimezone: true }),
    printCount: integer("print_count").default(0).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("receipts_order_uidx").on(table.orderId),
    uniqueIndex("receipts_token_uidx").on(table.verificationToken),
  ],
);

export const heldOrders = pgTable(
  "held_orders",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").notNull().references(() => branches.id, { onDelete: "cascade" }),
    createdBy: text("created_by").notNull().references(() => user.id, { onDelete: "set null" }),
    status: text("status").$type<"held" | "resumed" | "expired" | "discarded">().default("held").notNull(),
    cartData: jsonb("cart_data").$type<{
      items: Array<{ variantId: string; quantity: number; unitPrice: string; notes?: string }>;
      customerId?: string;
      orderNotes?: string;
      discountAmount?: string;
    }>().notNull(),
    resumedAt: timestamp("resumed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, JsonValue>>().default({}),
    ...timestamps(),
  },
  (table) => [
    index("held_orders_org_branch_idx").on(table.organizationId, table.branchId),
    index("held_orders_status_expires_idx").on(table.status, table.expiresAt),
    index("held_orders_created_by_idx").on(table.createdBy),
  ],
);
