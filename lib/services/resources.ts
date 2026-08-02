import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import type { Permission } from "@/lib/server";
import { assertAccountingDateOpen, AppError, paginationSchema, parseJson, parseSearchParams } from "@/lib/server";
import { dataResponse } from "@/lib/api";
import type { ApiContext } from "@/lib/api";

type FieldType = "text" | "uuid" | "boolean" | "integer" | "bigint" | "date" | "timestamp" | "json";
type Field = { column?: string; type: FieldType; required?: boolean };

export type ResourceConfig = {
  table: string;
  read: Permission;
  write: Permission;
  fields: Record<string, Field>;
  search?: string[];
};

const text = (required = false): Field => ({ type: "text", required });
const uuid = (required = false): Field => ({ type: "uuid", required });
const boolean = (): Field => ({ type: "boolean" });
const integer = (): Field => ({ type: "integer" });
const bigint = (): Field => ({ type: "bigint" });
const date = (): Field => ({ type: "date" });
const timestamp = (): Field => ({ type: "timestamp" });
const json = (): Field => ({ type: "json" });

export const resources = {
  categories: { table: "categories", read: "inventory:read", write: "inventory:write", search: ["name", "slug"], fields: { parentId: uuid(), name: text(true), slug: text(true), description: text(), sortOrder: integer(), isActive: boolean() } },
  brands: { table: "brands", read: "inventory:read", write: "inventory:write", search: ["name", "slug"], fields: { name: text(true), slug: text(true), description: text(), logoUrl: text(), isActive: boolean() } },
  units: { table: "units", read: "inventory:read", write: "inventory:write", search: ["name", "symbol"], fields: { name: text(true), symbol: text(true), precision: integer() } },
  products: { table: "products", read: "inventory:read", write: "inventory:write", search: ["name", "slug", "sku"], fields: { categoryId: uuid(), brandId: uuid(), unitId: uuid(), taxRateId: uuid(), type: text(), name: text(true), slug: text(true), sku: text(), description: text(), imageUrl: text(), trackStock: boolean(), trackSerials: boolean(), trackExpiry: boolean(), allowNegativeStock: boolean(), isActive: boolean(), metadata: json() } },
  variants: { table: "product_variants", read: "inventory:read", write: "inventory:write", search: ["name", "sku", "barcode"], fields: { productId: uuid(true), name: text(true), sku: text(true), barcode: text(), costAmount: bigint(), priceAmount: bigint(), compareAtAmount: bigint(), attributes: json(), weightGrams: integer(), isDefault: boolean(), isActive: boolean() } },
  barcodes: { table: "product_barcodes", read: "inventory:read", write: "inventory:write", search: ["value"], fields: { variantId: uuid(true), value: text(true), format: text(), isPrimary: boolean() } },
  suppliers: { table: "suppliers", read: "suppliers:read", write: "suppliers:write", search: ["code", "name", "phone", "email"], fields: { code: text(true), name: text(true), contactName: text(), email: text(), phone: text(), address: text(), taxId: text(), paymentTermsDays: integer(), isActive: boolean(), metadata: json() } },
  customers: { table: "customers", read: "customers:read", write: "customers:write", search: ["code", "name", "phone", "email"], fields: { membershipLevelId: uuid(), code: text(true), name: text(true), email: text(), phone: text(), dateOfBirth: date(), address: text(), notes: text(), referralCode: text(), referredByCustomerId: uuid(), totalSpendAmount: bigint(), storeCreditAmount: bigint(), isActive: boolean(), metadata: json() } },
  promotions: { table: "promotions", read: "sales:read", write: "sales:write", search: ["name", "code"], fields: { name: text(true), code: text(), type: text(true), valueAmount: bigint(), percentageBps: integer(), rules: json(), startsAt: timestamp(), endsAt: timestamp(), usageLimit: integer(), perCustomerLimit: integer(), isActive: boolean() } },
  branches: { table: "branches", read: "dashboard:read", write: "branches:manage", search: ["code", "name", "city"], fields: { code: text(true), name: text(true), phone: text(), email: text(), address: text(), city: text(), province: text(), postalCode: text(), timezone: text(), isActive: boolean() } },
  warehouses: { table: "warehouses", read: "inventory:read", write: "branches:manage", search: ["code", "name"], fields: { branchId: uuid(), code: text(true), name: text(true), address: text(), isDefault: boolean(), isActive: boolean() } },
  employees: { table: "employees", read: "dashboard:read", write: "employees:manage", search: ["employee_number", "name", "email", "phone"], fields: { userId: text(), employeeNumber: { ...text(true), column: "employee_number" }, name: text(true), email: text(), phone: text(), jobTitle: text(), employmentStatus: text(), hiredAt: date(), salaryReferenceAmount: bigint(), commissionRateBps: integer() } },
  expenses: { table: "expenses", read: "finance:read", write: "finance:write", search: ["expense_number", "category", "vendor", "description"], fields: { branchId: uuid(), accountId: uuid(), expenseNumber: { ...text(true), column: "expense_number" }, category: text(true), vendor: text(), description: text(true), amount: bigint(), status: text(), expenseDate: date(), receiptUrl: text() } },
  "cash-registers": { table: "cash_registers", read: "finance:read", write: "finance:write", search: ["name", "code"], fields: { branchId: uuid(true), name: text(true), code: text(true), isActive: boolean() } },
  "dining-tables": { table: "dining_tables", read: "sales:read", write: "sales:write", search: ["name", "code"], fields: { branchId: uuid(true), name: text(true), code: text(true), capacity: integer(), status: text(), area: text() } },
  reservations: { table: "reservations", read: "sales:read", write: "sales:write", search: ["booking_number", "guest_name", "guest_phone"], fields: { branchId: uuid(true), tableId: uuid(), customerId: uuid(), bookingNumber: { ...text(true), column: "booking_number" }, guestName: text(true), guestPhone: text(), partySize: integer(), status: text(), reservedAt: timestamp(), notes: text() } },
  "purchase-orders": { table: "purchase_orders", read: "purchases:read", write: "purchases:write", search: ["order_number", "notes"], fields: { branchId: uuid(), warehouseId: uuid(true), supplierId: uuid(true), orderNumber: { ...text(true), column: "order_number" }, status: text(), orderDate: date(), expectedDate: date(), subtotalAmount: bigint(), discountAmount: bigint(), taxAmount: bigint(), totalAmount: bigint(), notes: text() } },
  "stock-transfers": { table: "stock_transfers", read: "inventory:read", write: "inventory:write", search: ["transfer_number", "notes"], fields: { transferNumber: { ...text(true), column: "transfer_number" }, fromWarehouseId: uuid(true), toWarehouseId: uuid(true), status: text(), notes: text() } },
  "stock-counts": { table: "stock_counts", read: "inventory:read", write: "inventory:write", search: ["count_number", "notes"], fields: { warehouseId: uuid(true), countNumber: { ...text(true), column: "count_number" }, status: text(), notes: text() } },
  "stock-balances": { table: "stock_balances", read: "inventory:read", write: "inventory:write", fields: { warehouseId: uuid(true), variantId: uuid(true), onHand: bigint(), reserved: bigint(), available: bigint(), reorderPoint: bigint(), reorderQuantity: bigint(), averageCostAmount: bigint() } },
  "stock-movements": { table: "stock_movements", read: "inventory:read", write: "inventory:write", search: ["reference_type", "reason"], fields: { branchId: uuid(), warehouseId: uuid(true), variantId: uuid(true), type: text(true), quantity: bigint(), beforeQuantity: bigint(), afterQuantity: bigint(), unitCostAmount: bigint(), referenceType: text(), referenceId: uuid(), reason: text() } },
  notifications: { table: "notifications", read: "dashboard:read", write: "settings:manage", search: ["template", "recipient", "subject"], fields: { userId: text(), channel: text(true), template: text(true), recipient: text(true), subject: text(), body: text(true), status: text(), scheduledAt: timestamp() } },
  integrations: { table: "integrations", read: "settings:manage", write: "settings:manage", search: ["provider", "name"], fields: { provider: text(true), name: text(true), encryptedConfig: text(true), status: text() } },
  settings: { table: "organization_settings", read: "settings:manage", write: "settings:manage", search: ["namespace"], fields: { namespace: text(true), value: json(), isSecret: boolean() } },
  shifts: { table: "employee_shifts", read: "dashboard:read", write: "employees:manage", fields: { branchId: uuid(true), employeeId: uuid(true), startsAt: timestamp(), endsAt: timestamp(), status: text(), notes: text() } },
  attendance: { table: "attendance", read: "dashboard:read", write: "employees:manage", fields: { employeeId: uuid(true), shiftId: uuid(), clockedInAt: timestamp(), clockedOutAt: timestamp(), notes: text() } },
} as const satisfies Record<string, ResourceConfig>;

export type ResourceName = keyof typeof resources;

function snakeCase(value: string): string {
  return value.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`);
}

function fieldColumn(name: string, field: Field): string {
  return field.column ?? snakeCase(name);
}

function parseField(field: Field, value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  switch (field.type) {
    case "text": return z.string().max(5_000).parse(value);
    case "uuid": return z.string().uuid().parse(value);
    case "boolean": return z.boolean().parse(value);
    case "integer": return z.coerce.number().int().parse(value);
    case "bigint": return z.union([z.string().regex(/^-?\d+$/), z.number().int().safe()]).transform(BigInt).parse(value);
    case "date": return z.string().date().parse(value);
    case "timestamp": return z.coerce.date().parse(value);
    case "json": return value;
  }
}

async function parseResourceBody(request: Request, config: ResourceConfig, partial: boolean) {
  const body = await parseJson(request, z.record(z.string(), z.unknown()));
  const unknownFields = Object.keys(body).filter((key) => !config.fields[key]);
  if (unknownFields.length) throw new AppError("VALIDATION_ERROR", `Unknown fields: ${unknownFields.join(", ")}`);
  if (!partial) {
    const missing = Object.entries(config.fields).filter(([key, field]) => field.required && body[key] === undefined).map(([key]) => key);
    if (missing.length) throw new AppError("VALIDATION_ERROR", `Missing required fields: ${missing.join(", ")}`);
  }
  return Object.fromEntries(
    Object.entries(body).map(([key, value]) => [fieldColumn(key, config.fields[key]), parseField(config.fields[key], value)]),
  );
}

function valuesSql(values: Record<string, unknown>) {
  const entries = Object.entries(values).filter(([, value]) => value !== undefined);
  if (!entries.length) throw new AppError("VALIDATION_ERROR", "At least one field is required");
  return {
    columns: sql.join(entries.map(([column]) => sql.identifier(column)), sql.raw(", ")),
    values: sql.join(entries.map(([, value]) => sql`${value}`), sql.raw(", ")),
    updates: sql.join(entries.map(([column, value]) => sql`${sql.identifier(column)} = ${value}`), sql.raw(", ")),
  };
}

export async function listResource(name: ResourceName, request: Request, context: ApiContext): Promise<Response> {
  const config: ResourceConfig = resources[name];
  const query = parseSearchParams(request.url, paginationSchema.extend({ q: z.string().max(100).optional(), page: z.coerce.number().int().min(1).default(1) }));
  const offset = (query.page - 1) * query.limit;
  const search = query.q && config.search?.length
    ? sql` and (${sql.join(config.search.map((column: string) => sql`${sql.identifier(column)} ilike ${`%${query.q}%`}`), sql.raw(" or "))})`
    : sql``;
  const result = await db.execute(sql`
    select * from ${sql.identifier(config.table)}
    where organization_id = ${context.organizationId}${search}
    order by created_at desc, id desc
    limit ${query.limit + 1} offset ${offset}
  `);
  const hasMore = result.rows.length > query.limit;
  return dataResponse(result.rows.slice(0, query.limit), {}, { page: query.page, limit: query.limit, hasMore });
}

export async function getResource(name: ResourceName, id: string, context: ApiContext): Promise<Response> {
  z.string().uuid().parse(id);
  const config = resources[name];
  const result = await db.execute(sql`select * from ${sql.identifier(config.table)} where id = ${id} and organization_id = ${context.organizationId} limit 1`);
  if (!result.rows[0]) throw new AppError("NOT_FOUND", `${name} record not found`);
  return dataResponse(result.rows[0]);
}

export async function createResource(name: ResourceName, request: Request, context: ApiContext): Promise<Response> {
  const config = resources[name];
  const body = await parseResourceBody(request, config, false);
  const id = crypto.randomUUID();
  const record = await db.transaction(async (tx) => {
    if (name === "expenses") {
      const branchId = body.branch_id;
      const expenseDate = body.expense_date;
      if (typeof branchId !== "string" || typeof expenseDate !== "string") {
        throw new AppError("VALIDATION_ERROR", "branchId dan expenseDate wajib untuk expense");
      }
      await assertAccountingDateOpen(tx, { organizationId: context.organizationId, branchId, date: expenseDate });
    }
    const values = valuesSql({ id, organization_id: context.organizationId, ...body });
    const result = await tx.execute(sql`insert into ${sql.identifier(config.table)} (${values.columns}) values (${values.values}) returning *`);
    return result.rows[0];
  });
  return dataResponse(record, { status: 201 });
}

export async function updateResource(name: ResourceName, id: string, request: Request, context: ApiContext): Promise<Response> {
  z.string().uuid().parse(id);
  const config = resources[name];
  const body = await parseResourceBody(request, config, true);
  const record = await db.transaction(async (tx) => {
    if (name === "expenses") {
      const existing = await tx.execute<{ branch_id: string; expense_date: string }>(sql`select branch_id, expense_date::text from expenses where id = ${id} and organization_id = ${context.organizationId} limit 1`);
      const current = existing.rows[0];
      if (!current?.branch_id) throw new AppError("NOT_FOUND", "Expense record not found");
      await assertAccountingDateOpen(tx, { organizationId: context.organizationId, branchId: current.branch_id, date: current.expense_date });
      const targetBranch = typeof body.branch_id === "string" ? body.branch_id : current.branch_id;
      const targetDate = typeof body.expense_date === "string" ? body.expense_date : current.expense_date;
      await assertAccountingDateOpen(tx, { organizationId: context.organizationId, branchId: targetBranch, date: targetDate });
    }
    const values = valuesSql({ ...body, updated_at: new Date() });
    const result = await tx.execute(sql`update ${sql.identifier(config.table)} set ${values.updates} where id = ${id} and organization_id = ${context.organizationId} returning *`);
    return result.rows[0];
  });
  if (!record) throw new AppError("NOT_FOUND", `${name} record not found`);
  return dataResponse(record);
}

export async function deleteResource(name: ResourceName, id: string, context: ApiContext): Promise<Response> {
  z.string().uuid().parse(id);
  const config = resources[name];
  const deleted = await db.transaction(async (tx) => {
    if (name === "expenses") {
      const existing = await tx.execute<{ branch_id: string; expense_date: string }>(sql`select branch_id, expense_date::text from expenses where id = ${id} and organization_id = ${context.organizationId} limit 1`);
      const current = existing.rows[0];
      if (!current?.branch_id) throw new AppError("NOT_FOUND", "Expense record not found");
      await assertAccountingDateOpen(tx, { organizationId: context.organizationId, branchId: current.branch_id, date: current.expense_date });
    }
    const result = await tx.execute(sql`delete from ${sql.identifier(config.table)} where id = ${id} and organization_id = ${context.organizationId} returning id`);
    return result.rows[0];
  });
  if (!deleted) throw new AppError("NOT_FOUND", `${name} record not found`);
  return new Response(null, { status: 204 });
}
