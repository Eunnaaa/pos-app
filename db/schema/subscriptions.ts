import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { idColumn, timestamps, type JsonValue } from "./helpers";
import { organizations } from "./tenancy";

export const planTierEnum = ["free", "pro", "business"] as const;
export type PlanTier = (typeof planTierEnum)[number];

export const subscriptionStatusEnum = [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "expired",
] as const;
export type SubscriptionStatus = (typeof subscriptionStatusEnum)[number];

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: idColumn(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    plan: text("plan").$type<PlanTier>().default("free").notNull(),
    status: text("status").$type<SubscriptionStatus>().default("active").notNull(),
    billingCycle: text("billing_cycle").$type<"monthly" | "yearly">().default("monthly").notNull(),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }).defaultNow().notNull(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    paymentProvider: text("payment_provider"),
    externalSubscriptionId: text("external_subscription_id"),
    features: jsonb("features").$type<Record<string, JsonValue>>().default({}),
    metadata: jsonb("metadata").$type<Record<string, JsonValue>>().default({}),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("subscriptions_org_uidx").on(table.organizationId),
    index("subscriptions_plan_idx").on(table.plan),
    index("subscriptions_status_idx").on(table.status),
  ],
);

export const subscriptionInvoices = pgTable(
  "subscription_invoices",
  {
    id: idColumn(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    invoiceNumber: text("invoice_number").notNull(),
    amount: text("amount").notNull(), // in IDR string
    status: text("status").$type<"pending" | "paid" | "failed" | "expired">().default("pending").notNull(),
    paymentProvider: text("payment_provider"),
    paymentReference: text("payment_reference"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, JsonValue>>().default({}),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("subscription_invoices_number_uidx").on(table.invoiceNumber),
    index("subscription_invoices_org_idx").on(table.organizationId),
  ],
);

export const subscriptionRelations = relations(subscriptions, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [subscriptions.organizationId],
    references: [organizations.id],
  }),
  invoices: many(subscriptionInvoices),
}));
