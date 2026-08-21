import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { idColumn, moneyColumn, quantityColumn, timestamps, type JsonValue } from "./helpers";
import { organizations } from "./tenancy";

export const suppliers = pgTable(
  "suppliers",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    contactName: text("contact_name"),
    email: text("email"),
    phone: text("phone"),
    address: text("address"),
    taxId: text("tax_id"),
    paymentTermsDays: integer("payment_terms_days").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    metadata: jsonb("metadata").$type<Record<string, JsonValue>>().default({}),
    ...timestamps(),
  },
  (table) => [uniqueIndex("suppliers_org_code_uidx").on(table.organizationId, table.code)],
);

export const membershipLevels = pgTable(
  "membership_levels",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    minimumSpendAmount: moneyColumn("minimum_spend_amount"),
    pointMultiplier: integer("point_multiplier").default(1).notNull(),
    benefits: jsonb("benefits").$type<string[]>().default([]),
    ...timestamps(),
  },
  (table) => [uniqueIndex("membership_levels_org_name_uidx").on(table.organizationId, table.name)],
);

export const customers = pgTable(
  "customers",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    membershipLevelId: uuid("membership_level_id").references(() => membershipLevels.id, { onDelete: "set null" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    dateOfBirth: date("date_of_birth"),
    address: text("address"),
    notes: text("notes"),
    referralCode: text("referral_code"),
    referredByCustomerId: uuid("referred_by_customer_id"),
    totalSpendAmount: moneyColumn("total_spend_amount"),
    storeCreditAmount: moneyColumn("store_credit_amount"),
    isActive: boolean("is_active").default(true).notNull(),
    metadata: jsonb("metadata").$type<Record<string, JsonValue>>().default({}),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("customers_org_code_uidx").on(table.organizationId, table.code),
    uniqueIndex("customers_org_referral_uidx").on(table.organizationId, table.referralCode).where(sql`${table.referralCode} is not null`),
    index("customers_org_phone_idx").on(table.organizationId, table.phone),
  ],
);

export const loyaltyAccounts = pgTable(
  "loyalty_accounts",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
    pointsBalance: quantityColumn("points_balance"),
    lifetimePoints: quantityColumn("lifetime_points"),
    ...timestamps(),
  },
  (table) => [uniqueIndex("loyalty_accounts_customer_uidx").on(table.customerId)],
);

export const loyaltyTransactions = pgTable(
  "loyalty_transactions",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    loyaltyAccountId: uuid("loyalty_account_id").notNull().references(() => loyaltyAccounts.id, { onDelete: "cascade" }),
    type: text("type").$type<"earn" | "redeem" | "expire" | "adjust" | "cashback" | "referral">().notNull(),
    points: quantityColumn("points"),
    referenceType: text("reference_type"),
    referenceId: uuid("reference_id"),
    description: text("description"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [index("loyalty_transactions_account_time_idx").on(table.loyaltyAccountId, table.createdAt)],
);

export const promotions = pgTable(
  "promotions",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    code: text("code"),
    type: text("type").$type<"percentage" | "fixed" | "buy_x_get_y" | "bundle" | "cashback" | "happy_hour" | "flash_sale" | "birthday">().notNull(),
    valueAmount: moneyColumn("value_amount"),
    percentageBps: integer("percentage_bps").default(0).notNull(),
    rules: jsonb("rules").$type<Record<string, JsonValue>>().default({}),
    startsAt: timestamp("starts_at", { withTimezone: true }).defaultNow().notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    usageLimit: integer("usage_limit"),
    perCustomerLimit: integer("per_customer_limit"),
    usageCount: integer("usage_count").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("promotions_org_code_uidx").on(table.organizationId, table.code).where(sql`${table.code} is not null`),
    index("promotions_org_schedule_idx").on(table.organizationId, table.startsAt, table.endsAt),
  ],
);

export const vouchers = pgTable(
  "vouchers",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "cascade" }),
    promotionId: uuid("promotion_id").references(() => promotions.id, { onDelete: "set null" }),
    code: text("code").notNull(),
    initialAmount: moneyColumn("initial_amount"),
    remainingAmount: moneyColumn("remaining_amount"),
    status: text("status").$type<"active" | "redeemed" | "expired" | "cancelled">().default("active").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [uniqueIndex("vouchers_org_code_uidx").on(table.organizationId, table.code)],
);
