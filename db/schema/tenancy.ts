import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { idColumn, timestamps, type JsonValue } from "./helpers";

export const tenantRoles = [
  "owner",
  "manager",
  "cashier",
  "warehouse",
  "accountant",
] as const;
export type TenantRole = (typeof tenantRoles)[number];

export const organizations = pgTable(
  "organizations",
  {
    id: idColumn(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    legalName: text("legal_name"),
    taxId: text("tax_id"),
    defaultCurrency: text("default_currency").default("IDR").notNull(),
    timezone: text("timezone").default("Asia/Jakarta").notNull(),
    locale: text("locale").default("id-ID").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    metadata: jsonb("metadata").$type<Record<string, JsonValue>>().default({}),
    ...timestamps(),
  },
  (table) => [uniqueIndex("organizations_slug_uidx").on(table.slug)],
);

export const branches = pgTable(
  "branches",
  {
    id: idColumn(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    city: text("city"),
    province: text("province"),
    postalCode: text("postal_code"),
    timezone: text("timezone").default("Asia/Jakarta").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("branches_org_code_uidx").on(table.organizationId, table.code),
    index("branches_org_idx").on(table.organizationId),
  ],
);

export const warehouses = pgTable(
  "warehouses",
  {
    id: idColumn(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    address: text("address"),
    isDefault: boolean("is_default").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("warehouses_org_code_uidx").on(table.organizationId, table.code),
    index("warehouses_org_branch_idx").on(table.organizationId, table.branchId),
  ],
);

export const tenantMembers = pgTable(
  "tenant_members",
  {
    id: idColumn(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").$type<TenantRole>().default("cashier").notNull(),
    permissions: jsonb("permissions").$type<string[]>().default([]).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("tenant_members_org_user_uidx").on(table.organizationId, table.userId),
    index("tenant_members_user_idx").on(table.userId),
  ],
);

export const memberBranches = pgTable(
  "member_branches",
  {
    id: idColumn(),
    tenantMemberId: uuid("tenant_member_id")
      .notNull()
      .references(() => tenantMembers.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("member_branches_member_branch_uidx").on(
      table.tenantMemberId,
      table.branchId,
    ),
  ],
);

export const organizationRelations = relations(organizations, ({ many }) => ({
  branches: many(branches),
  warehouses: many(warehouses),
  members: many(tenantMembers),
}));

export const branchRelations = relations(branches, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [branches.organizationId],
    references: [organizations.id],
  }),
  warehouses: many(warehouses),
}));

export const tenantMemberRelations = relations(tenantMembers, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [tenantMembers.organizationId],
    references: [organizations.id],
  }),
  user: one(user, { fields: [tenantMembers.userId], references: [user.id] }),
  branches: many(memberBranches),
}));
