import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { idColumn, timestamps } from "./helpers";
import { diningTables } from "./hospitality";
import { branches, organizations } from "./tenancy";

/**
 * QR order tokens. Public-facing slug encoded in customer-facing QR codes.
 * One token per dining table; revocable via isActive or rotate.
 * Anonymous self-order API resolves tenancy from this row via the token slug.
 */
export const qrOrderTokens = pgTable(
  "qr_order_tokens",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").notNull().references(() => branches.id, { onDelete: "cascade" }),
    tableId: uuid("table_id").notNull().references(() => diningTables.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("qr_order_tokens_token_uidx").on(table.token),
    index("qr_order_tokens_org_branch_idx").on(table.organizationId, table.branchId),
    index("qr_order_tokens_table_idx").on(table.tableId),
    index("qr_order_tokens_active_idx").on(table.isActive),
  ],
);

export const staffCalls = pgTable(
  "staff_calls",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").notNull().references(() => branches.id, { onDelete: "cascade" }),
    tableId: uuid("table_id").notNull().references(() => diningTables.id, { onDelete: "cascade" }),
    reason: text("reason"),
    status: text("status").$type<"pending" | "serving" | "served">().default("pending").notNull(),
    servedAt: timestamp("served_at", { withTimezone: true }),
    servedBy: text("served_by"),
    ...timestamps(),
  },
  (table) => [
    index("staff_calls_org_branch_status_idx").on(table.organizationId, table.branchId, table.status),
    index("staff_calls_table_idx").on(table.tableId),
  ],
);
