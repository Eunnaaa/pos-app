import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { idColumn, moneyColumn, timestamps, type JsonValue } from "./helpers";
import { branches, organizations } from "./tenancy";

export const financialAccounts = pgTable(
  "financial_accounts",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    type: text("type").$type<"cash" | "bank" | "receivable" | "payable" | "income" | "expense" | "equity">().notNull(),
    currency: text("currency").default("IDR").notNull(),
    openingBalanceAmount: moneyColumn("opening_balance_amount"),
    currentBalanceAmount: moneyColumn("current_balance_amount"),
    isActive: boolean("is_active").default(true).notNull(),
    ...timestamps(),
  },
  (table) => [uniqueIndex("financial_accounts_org_code_uidx").on(table.organizationId, table.code)],
);

export const financialTransactions = pgTable(
  "financial_transactions",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    accountId: uuid("account_id").notNull().references(() => financialAccounts.id, { onDelete: "restrict" }),
    transactionNumber: text("transaction_number").notNull(),
    type: text("type").$type<"income" | "expense" | "transfer" | "adjustment">().notNull(),
    direction: text("direction").$type<"debit" | "credit">().notNull(),
    category: text("category"),
    amount: moneyColumn("amount"),
    description: text("description").notNull(),
    referenceType: text("reference_type"),
    referenceId: uuid("reference_id"),
    transactionDate: date("transaction_date").defaultNow().notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("financial_transactions_org_number_uidx").on(table.organizationId, table.transactionNumber),
    index("financial_transactions_org_date_idx").on(table.organizationId, table.transactionDate),
    check("financial_transactions_positive_amount", sql`${table.amount} > 0`),
  ],
);

export const expenses = pgTable(
  "expenses",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    accountId: uuid("account_id").references(() => financialAccounts.id, { onDelete: "set null" }),
    expenseNumber: text("expense_number").notNull(),
    category: text("category").notNull(),
    vendor: text("vendor"),
    description: text("description").notNull(),
    amount: moneyColumn("amount"),
    status: text("status").$type<"draft" | "submitted" | "approved" | "paid" | "rejected">().default("draft").notNull(),
    expenseDate: date("expense_date").defaultNow().notNull(),
    receiptUrl: text("receipt_url"),
    submittedBy: text("submitted_by").references(() => user.id, { onDelete: "set null" }),
    approvedBy: text("approved_by").references(() => user.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (table) => [uniqueIndex("expenses_org_number_uidx").on(table.organizationId, table.expenseNumber)],
);

export const cashRegisters = pgTable(
  "cash_registers",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").notNull().references(() => branches.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    code: text("code").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    ...timestamps(),
  },
  (table) => [uniqueIndex("cash_registers_branch_code_uidx").on(table.branchId, table.code)],
);

export const cashRegisterSessions = pgTable(
  "cash_register_sessions",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    registerId: uuid("register_id").notNull().references(() => cashRegisters.id, { onDelete: "restrict" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "restrict" }),
    status: text("status").$type<"open" | "closed">().default("open").notNull(),
    openingAmount: moneyColumn("opening_amount"),
    expectedClosingAmount: moneyColumn("expected_closing_amount"),
    actualClosingAmount: moneyColumn("actual_closing_amount"),
    varianceAmount: moneyColumn("variance_amount"),
    paymentBreakdown: jsonb("payment_breakdown").$type<Record<string, JsonValue>>().default({}).notNull(),
    settlementNotes: text("settlement_notes"),
    settledBy: text("settled_by").references(() => user.id, { onDelete: "set null" }),
    openedAt: timestamp("opened_at", { withTimezone: true }).defaultNow().notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index("cash_register_sessions_register_status_idx").on(table.registerId, table.status),
    uniqueIndex("cash_register_sessions_one_open_uidx").on(table.registerId).where(sql`${table.status} = 'open'`),
  ],
);

export const cashMovements = pgTable(
  "cash_movements",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").notNull().references(() => cashRegisterSessions.id, { onDelete: "restrict" }),
    direction: text("direction").$type<"in" | "out">().notNull(),
    amount: moneyColumn("amount"),
    category: text("category").notNull(),
    reason: text("reason").notNull(),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (table) => [
    index("cash_movements_session_time_idx").on(table.sessionId, table.createdAt),
    check("cash_movements_positive_amount", sql`${table.amount} > 0`),
  ],
);

export const bookClosingPeriods = pgTable(
  "book_closing_periods",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").notNull().references(() => branches.id, { onDelete: "cascade" }),
    periodType: text("period_type").$type<"day" | "month" | "year">().notNull(),
    periodKey: text("period_key").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    timezone: text("timezone").notNull(),
    status: text("status").$type<"closed" | "reopened">().default("closed").notNull(),
    totals: jsonb("totals").$type<Record<string, JsonValue>>().notNull(),
    closedBy: text("closed_by").references(() => user.id, { onDelete: "set null" }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    reopenedBy: text("reopened_by").references(() => user.id, { onDelete: "set null" }),
    reopenedAt: timestamp("reopened_at", { withTimezone: true }),
    reopenReason: text("reopen_reason"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("book_closing_periods_scope_uidx").on(table.organizationId, table.branchId, table.periodType, table.periodKey),
    index("book_closing_periods_status_idx").on(table.organizationId, table.branchId, table.status),
    check("book_closing_periods_valid_range", sql`${table.periodEnd} > ${table.periodStart}`),
  ],
);
