import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { idColumn, moneyColumn, quantityColumn, timestamps, type JsonValue } from "./helpers";
import { organizations } from "./tenancy";

export const categories = pgTable(
  "categories",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("categories_org_slug_uidx").on(table.organizationId, table.slug),
    index("categories_org_parent_idx").on(table.organizationId, table.parentId),
  ],
);

export const brands = pgTable(
  "brands",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    logoUrl: text("logo_url"),
    isActive: boolean("is_active").default(true).notNull(),
    ...timestamps(),
  },
  (table) => [uniqueIndex("brands_org_slug_uidx").on(table.organizationId, table.slug)],
);

export const units = pgTable(
  "units",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    symbol: text("symbol").notNull(),
    precision: integer("precision").default(0).notNull(),
    ...timestamps(),
  },
  (table) => [uniqueIndex("units_org_symbol_uidx").on(table.organizationId, table.symbol)],
);

export const taxRates = pgTable(
  "tax_rates",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    rate: numeric("rate", { precision: 7, scale: 4 }).default("0").notNull(),
    isInclusive: boolean("is_inclusive").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    ...timestamps(),
  },
  (table) => [uniqueIndex("tax_rates_org_name_uidx").on(table.organizationId, table.name)],
);

export const products = pgTable(
  "products",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "set null" }),
    unitId: uuid("unit_id").references(() => units.id, { onDelete: "set null" }),
    taxRateId: uuid("tax_rate_id").references(() => taxRates.id, { onDelete: "set null" }),
    type: text("type").$type<"standard" | "service" | "bundle" | "composite">().default("standard").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    sku: text("sku"),
    description: text("description"),
    imageUrl: text("image_url"),
    trackStock: boolean("track_stock").default(true).notNull(),
    trackSerials: boolean("track_serials").default(false).notNull(),
    trackExpiry: boolean("track_expiry").default(false).notNull(),
    allowNegativeStock: boolean("allow_negative_stock").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    metadata: jsonb("metadata").$type<Record<string, JsonValue>>().default({}),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("products_org_slug_uidx").on(table.organizationId, table.slug),
    uniqueIndex("products_org_sku_uidx").on(table.organizationId, table.sku).where(sql`${table.sku} is not null`),
    index("products_org_category_idx").on(table.organizationId, table.categoryId),
  ],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sku: text("sku").notNull(),
    barcode: text("barcode"),
    costAmount: moneyColumn("cost_amount"),
    priceAmount: moneyColumn("price_amount"),
    compareAtAmount: moneyColumn("compare_at_amount"),
    attributes: jsonb("attributes").$type<Record<string, string>>().default({}),
    weightGrams: integer("weight_grams"),
    isDefault: boolean("is_default").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("product_variants_org_sku_uidx").on(table.organizationId, table.sku),
    uniqueIndex("product_variants_org_barcode_uidx").on(table.organizationId, table.barcode).where(sql`${table.barcode} is not null`),
    index("product_variants_product_idx").on(table.productId),
    check("product_variants_nonnegative_price", sql`${table.priceAmount} >= 0`),
  ],
);

export const productComponents = pgTable(
  "product_components",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    parentVariantId: uuid("parent_variant_id").notNull().references(() => productVariants.id, { onDelete: "cascade" }),
    componentVariantId: uuid("component_variant_id").notNull().references(() => productVariants.id, { onDelete: "restrict" }),
    quantity: quantityColumn("quantity"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("product_components_pair_uidx").on(table.parentVariantId, table.componentVariantId),
    check("product_components_positive_quantity", sql`${table.quantity} > 0`),
  ],
);

export const productBarcodes = pgTable(
  "product_barcodes",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").notNull().references(() => productVariants.id, { onDelete: "cascade" }),
    value: text("value").notNull(),
    format: text("format").default("CODE128").notNull(),
    isPrimary: boolean("is_primary").default(false).notNull(),
    ...timestamps(),
  },
  (table) => [uniqueIndex("product_barcodes_org_value_uidx").on(table.organizationId, table.value)],
);

export const productImages = pgTable(
  "product_images",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    imageUrl: text("image_url").notNull(),
    altText: text("alt_text"),
    isPrimary: boolean("is_primary").default(false).notNull(),
    displayOrder: integer("display_order").default(0).notNull(),
    metadata: jsonb("metadata").$type<Record<string, JsonValue>>().default({}),
    ...timestamps(),
  },
  (table) => [
    index("product_images_product_idx").on(table.productId),
    index("product_images_org_primary_idx").on(table.organizationId, table.isPrimary),
  ],
);
