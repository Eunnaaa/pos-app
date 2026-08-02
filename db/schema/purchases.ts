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
import { suppliers } from "./parties";
import { branches, organizations, warehouses } from "./tenancy";

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    warehouseId: uuid("warehouse_id").notNull().references(() => warehouses.id, { onDelete: "restrict" }),
    supplierId: uuid("supplier_id").notNull().references(() => suppliers.id, { onDelete: "restrict" }),
    orderNumber: text("order_number").notNull(),
    status: text("status").$type<"draft" | "submitted" | "partially_received" | "received" | "cancelled">().default("draft").notNull(),
    orderDate: date("order_date").defaultNow().notNull(),
    expectedDate: date("expected_date"),
    subtotalAmount: moneyColumn("subtotal_amount"),
    discountAmount: moneyColumn("discount_amount"),
    taxAmount: moneyColumn("tax_amount"),
    totalAmount: moneyColumn("total_amount"),
    notes: text("notes"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    approvedBy: text("approved_by").references(() => user.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("purchase_orders_org_number_uidx").on(table.organizationId, table.orderNumber),
    index("purchase_orders_org_supplier_idx").on(table.organizationId, table.supplierId),
  ],
);

export const purchaseOrderItems = pgTable(
  "purchase_order_items",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    purchaseOrderId: uuid("purchase_order_id").notNull().references(() => purchaseOrders.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").notNull().references(() => productVariants.id, { onDelete: "restrict" }),
    quantity: quantityColumn("quantity"),
    receivedQuantity: quantityColumn("received_quantity"),
    unitCostAmount: moneyColumn("unit_cost_amount"),
    discountAmount: moneyColumn("discount_amount"),
    taxAmount: moneyColumn("tax_amount"),
    totalAmount: moneyColumn("total_amount"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("purchase_order_items_order_variant_uidx").on(table.purchaseOrderId, table.variantId),
    check("purchase_order_items_positive_quantity", sql`${table.quantity} > 0`),
  ],
);

export const goodsReceipts = pgTable(
  "goods_receipts",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    purchaseOrderId: uuid("purchase_order_id").references(() => purchaseOrders.id, { onDelete: "set null" }),
    warehouseId: uuid("warehouse_id").notNull().references(() => warehouses.id, { onDelete: "restrict" }),
    receiptNumber: text("receipt_number").notNull(),
    status: text("status").$type<"draft" | "posted" | "cancelled">().default("draft").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    receivedBy: text("received_by").references(() => user.id, { onDelete: "set null" }),
    notes: text("notes"),
    ...timestamps(),
  },
  (table) => [uniqueIndex("goods_receipts_org_number_uidx").on(table.organizationId, table.receiptNumber)],
);

export const goodsReceiptItems = pgTable("goods_receipt_items", {
  id: idColumn(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  goodsReceiptId: uuid("goods_receipt_id").notNull().references(() => goodsReceipts.id, { onDelete: "cascade" }),
  purchaseOrderItemId: uuid("purchase_order_item_id").references(() => purchaseOrderItems.id, { onDelete: "set null" }),
  variantId: uuid("variant_id").notNull().references(() => productVariants.id, { onDelete: "restrict" }),
  quantity: quantityColumn("quantity"),
  acceptedQuantity: quantityColumn("accepted_quantity"),
  rejectedQuantity: quantityColumn("rejected_quantity"),
  batchNumber: text("batch_number"),
  expiryDate: date("expiry_date"),
  unitCostAmount: moneyColumn("unit_cost_amount"),
  ...timestamps(),
});

export const purchaseInvoices = pgTable(
  "purchase_invoices",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    supplierId: uuid("supplier_id").notNull().references(() => suppliers.id, { onDelete: "restrict" }),
    purchaseOrderId: uuid("purchase_order_id").references(() => purchaseOrders.id, { onDelete: "set null" }),
    invoiceNumber: text("invoice_number").notNull(),
    supplierInvoiceNumber: text("supplier_invoice_number"),
    status: text("status").$type<"draft" | "open" | "partially_paid" | "paid" | "void">().default("draft").notNull(),
    invoiceDate: date("invoice_date").defaultNow().notNull(),
    dueDate: date("due_date"),
    totalAmount: moneyColumn("total_amount"),
    paidAmount: moneyColumn("paid_amount"),
    balanceAmount: moneyColumn("balance_amount"),
    ...timestamps(),
  },
  (table) => [uniqueIndex("purchase_invoices_org_number_uidx").on(table.organizationId, table.invoiceNumber)],
);

export const purchasePayments = pgTable(
  "purchase_payments",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id").notNull().references(() => purchaseInvoices.id, { onDelete: "restrict" }),
    paymentNumber: text("payment_number").notNull(),
    method: text("method").notNull(),
    amount: moneyColumn("amount"),
    externalReference: text("external_reference"),
    paidAt: timestamp("paid_at", { withTimezone: true }).defaultNow().notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("purchase_payments_org_number_uidx").on(table.organizationId, table.paymentNumber),
    check("purchase_payments_positive_amount", sql`${table.amount} > 0`),
  ],
);

export const purchaseReturns = pgTable(
  "purchase_returns",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    supplierId: uuid("supplier_id").notNull().references(() => suppliers.id, { onDelete: "restrict" }),
    goodsReceiptId: uuid("goods_receipt_id").references(() => goodsReceipts.id, { onDelete: "set null" }),
    returnNumber: text("return_number").notNull(),
    status: text("status").$type<"draft" | "shipped" | "credited" | "cancelled">().default("draft").notNull(),
    reason: text("reason"),
    totalAmount: moneyColumn("total_amount"),
    ...timestamps(),
  },
  (table) => [uniqueIndex("purchase_returns_org_number_uidx").on(table.organizationId, table.returnNumber)],
);

export const purchaseReturnItems = pgTable("purchase_return_items", {
  id: idColumn(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  purchaseReturnId: uuid("purchase_return_id").notNull().references(() => purchaseReturns.id, { onDelete: "cascade" }),
  variantId: uuid("variant_id").notNull().references(() => productVariants.id, { onDelete: "restrict" }),
  quantity: quantityColumn("quantity"),
  unitCostAmount: moneyColumn("unit_cost_amount"),
  totalAmount: moneyColumn("total_amount"),
  ...timestamps(),
});
