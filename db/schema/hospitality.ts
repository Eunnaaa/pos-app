import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { idColumn, timestamps } from "./helpers";
import { customers } from "./parties";
import { salesOrderItems, salesOrders } from "./sales";
import { branches, organizations } from "./tenancy";

export const diningTables = pgTable(
  "dining_tables",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").notNull().references(() => branches.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    area: text("area"),
    capacity: integer("capacity").default(1).notNull(),
    status: text("status").$type<"available" | "occupied" | "reserved" | "inactive">().default("available").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    ...timestamps(),
  },
  (table) => [uniqueIndex("dining_tables_branch_name_uidx").on(table.branchId, table.name)],
);

export const reservations = pgTable(
  "reservations",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").notNull().references(() => branches.id, { onDelete: "cascade" }),
    tableId: uuid("table_id").references(() => diningTables.id, { onDelete: "set null" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    guestName: text("guest_name").notNull(),
    guestPhone: text("guest_phone"),
    partySize: integer("party_size").default(1).notNull(),
    status: text("status").$type<"pending" | "confirmed" | "seated" | "completed" | "cancelled" | "no_show" | "waiting">().default("pending").notNull(),
    reservedAt: timestamp("reserved_at", { withTimezone: true }).notNull(),
    notes: text("notes"),
    ...timestamps(),
  },
  (table) => [index("reservations_branch_time_idx").on(table.branchId, table.reservedAt)],
);

export const kitchenTickets = pgTable(
  "kitchen_tickets",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").notNull().references(() => branches.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").notNull().references(() => salesOrders.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
    status: text("status").$type<"queued" | "cooking" | "ready" | "served" | "cancelled">().default("queued").notNull(),
    priority: integer("priority").default(0).notNull(),
    assignedTo: text("assigned_to").references(() => user.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    servedAt: timestamp("served_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("kitchen_tickets_branch_number_uidx").on(table.branchId, table.number),
    index("kitchen_tickets_branch_status_idx").on(table.branchId, table.status),
  ],
);

export const kitchenTicketItems = pgTable("kitchen_ticket_items", {
  id: idColumn(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  ticketId: uuid("ticket_id").notNull().references(() => kitchenTickets.id, { onDelete: "cascade" }),
  orderItemId: uuid("order_item_id").notNull().references(() => salesOrderItems.id, { onDelete: "cascade" }),
  status: text("status").$type<"queued" | "cooking" | "ready" | "served" | "cancelled">().default("queued").notNull(),
  notes: text("notes"),
  ...timestamps(),
});
