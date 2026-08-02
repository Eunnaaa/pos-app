import { and, desc, eq, gte, lt, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Database } from "@/db";
import {
  bookClosingPeriods,
  branches,
  cashMovements,
  cashRegisters,
  cashRegisterSessions,
  expenses,
  refunds,
  salesOrders,
  salesPayments,
  salesReturns,
  type JsonValue,
} from "@/db/schema";
import type { ApiContext } from "@/lib/api";
import { AppError, writeAuditLog } from "@/lib/server";
import { addClosingTotals, zeroClosingTotals, type ClosingTotals } from "./closing-totals";

export type ClosingPeriodType = "day" | "month" | "year";
export { addClosingTotals, type ClosingTotals } from "./closing-totals";

export const closeDaySchema = z.object({ branchId: z.string().uuid(), date: z.string().date() });
export const closeMonthSchema = z.object({ branchId: z.string().uuid(), month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) });
export const closeYearSchema = z.object({ branchId: z.string().uuid(), year: z.string().regex(/^\d{4}$/) });
export const reopenPeriodSchema = z.object({ reason: z.string().min(5).max(1_000) });


function normalizeTotals(value: Record<string, JsonValue>): ClosingTotals {
  const empty = zeroClosingTotals();
  const paymentValue = value.paymentMethods && typeof value.paymentMethods === "object" && !Array.isArray(value.paymentMethods) ? value.paymentMethods : {};
  return {
    salesGross: String(value.salesGross ?? empty.salesGross), salesNet: String(value.salesNet ?? empty.salesNet), discounts: String(value.discounts ?? empty.discounts),
    tax: String(value.tax ?? empty.tax), cost: String(value.cost ?? empty.cost), profit: String(value.profit ?? empty.profit), refunds: String(value.refunds ?? empty.refunds),
    expenses: String(value.expenses ?? empty.expenses), cashIn: String(value.cashIn ?? empty.cashIn), cashOut: String(value.cashOut ?? empty.cashOut),
    orders: Number(value.orders ?? 0), paymentMethods: Object.fromEntries(Object.entries(paymentValue).map(([key, amount]) => [key, String(amount)])),
  };
}

async function getBranch(input: { branchId: string; organizationId: string }, database: Database = db) {
  const [branch] = await database.select({ id: branches.id, timezone: branches.timezone }).from(branches).where(and(eq(branches.id, input.branchId), eq(branches.organizationId, input.organizationId), eq(branches.isActive, true))).limit(1);
  if (!branch) throw new AppError("NOT_FOUND", "Cabang tidak ditemukan");
  return branch;
}

async function getRange(type: ClosingPeriodType, key: string, timezone: string, database: Database = db): Promise<{ start: Date; end: Date }> {
  const dateKey = type === "day" ? key : type === "month" ? `${key}-01` : `${key}-01-01`;
  const interval = type === "day" ? "1 day" : type === "month" ? "1 month" : "1 year";
  const result = await database.execute<{ start_at: Date; end_at: Date }>(sql`
    select (${dateKey}::date::timestamp at time zone ${timezone}) as start_at,
           (((${dateKey}::date + ${sql.raw(`interval '${interval}'`)})::timestamp) at time zone ${timezone}) as end_at
  `);
  return { start: new Date(result.rows[0].start_at), end: new Date(result.rows[0].end_at) };
}

async function aggregateDay(organizationId: string, branchId: string, start: Date, end: Date, database: Database = db): Promise<ClosingTotals> {
  const [sales] = await database.select({
    salesGross: sql<string>`coalesce(sum(${salesOrders.subtotalAmount}), 0)`, salesNet: sql<string>`coalesce(sum(${salesOrders.totalAmount}), 0)`,
    discounts: sql<string>`coalesce(sum(${salesOrders.discountAmount}), 0)`, tax: sql<string>`coalesce(sum(${salesOrders.taxAmount}), 0)`,
    cost: sql<string>`coalesce(sum(${salesOrders.costAmount}), 0)`, orders: sql<number>`count(*)::int`,
  }).from(salesOrders).where(and(eq(salesOrders.organizationId, organizationId), eq(salesOrders.branchId, branchId), gte(salesOrders.occurredAt, start), lt(salesOrders.occurredAt, end), sql`${salesOrders.status} in ('paid', 'partially_refunded', 'refunded')`));
  const [refundRow] = await database.select({ amount: sql<string>`coalesce(sum(${refunds.amount}), 0)` }).from(refunds).innerJoin(salesReturns, eq(salesReturns.id, refunds.returnId)).where(and(eq(salesReturns.organizationId, organizationId), eq(salesReturns.branchId, branchId), eq(refunds.status, "processed"), gte(refunds.processedAt, start), lt(refunds.processedAt, end)));
  const [expenseRow] = await database.select({ amount: sql<string>`coalesce(sum(${expenses.amount}), 0)` }).from(expenses).where(and(eq(expenses.organizationId, organizationId), eq(expenses.branchId, branchId), sql`${expenses.status} in ('approved', 'paid')`, gte(expenses.createdAt, start), lt(expenses.createdAt, end)));
  const paymentRows = await database.select({ method: salesPayments.method, amount: sql<string>`coalesce(sum(${salesPayments.amount}), 0)` }).from(salesPayments).innerJoin(salesOrders, eq(salesOrders.id, salesPayments.orderId)).where(and(eq(salesOrders.organizationId, organizationId), eq(salesOrders.branchId, branchId), gte(salesPayments.paidAt, start), lt(salesPayments.paidAt, end), inSettled())).groupBy(salesPayments.method);
  const movementRows = await database.select({ direction: cashMovements.direction, amount: sql<string>`coalesce(sum(${cashMovements.amount}), 0)` }).from(cashMovements).innerJoin(cashRegisterSessions, eq(cashRegisterSessions.id, cashMovements.sessionId)).innerJoin(cashRegisters, eq(cashRegisters.id, cashRegisterSessions.registerId)).where(and(eq(cashMovements.organizationId, organizationId), eq(cashRegisters.branchId, branchId), gte(cashMovements.createdAt, start), lt(cashMovements.createdAt, end))).groupBy(cashMovements.direction);
  const refundsAmount = BigInt(refundRow?.amount ?? "0");
  const salesNet = BigInt(sales?.salesNet ?? "0");
  const cost = BigInt(sales?.cost ?? "0");
  return {
    salesGross: sales?.salesGross ?? "0", salesNet: (salesNet - refundsAmount).toString(), discounts: sales?.discounts ?? "0", tax: sales?.tax ?? "0", cost: cost.toString(),
    profit: (salesNet - refundsAmount - cost).toString(), refunds: refundsAmount.toString(), expenses: expenseRow?.amount ?? "0",
    cashIn: movementRows.find((row) => row.direction === "in")?.amount ?? "0", cashOut: movementRows.find((row) => row.direction === "out")?.amount ?? "0",
    orders: sales?.orders ?? 0, paymentMethods: Object.fromEntries(paymentRows.map((row) => [row.method, row.amount])),
  };
}

function inSettled() {
  return sql`${salesPayments.status} in ('settled', 'authorized')`;
}

async function closePeriod(type: ClosingPeriodType, key: string, branchId: string, context: ApiContext) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`closing:${context.organizationId}:${branchId}:${type}:${key}`}))`);
    const branch = await getBranch({ branchId, organizationId: context.organizationId }, tx as unknown as Database);
    const range = await getRange(type, key, branch.timezone, tx as unknown as Database);
    const [existing] = await tx.select().from(bookClosingPeriods).where(and(eq(bookClosingPeriods.organizationId, context.organizationId), eq(bookClosingPeriods.branchId, branchId), eq(bookClosingPeriods.periodType, type), eq(bookClosingPeriods.periodKey, key))).limit(1);
    if (existing?.status === "closed") throw new AppError("CONFLICT", `Periode ${type} ${key} sudah ditutup`);
    const [parent] = await tx.select({ id: bookClosingPeriods.id, periodType: bookClosingPeriods.periodType, periodKey: bookClosingPeriods.periodKey }).from(bookClosingPeriods).where(and(eq(bookClosingPeriods.organizationId, context.organizationId), eq(bookClosingPeriods.branchId, branchId), eq(bookClosingPeriods.status, "closed"), ne(bookClosingPeriods.periodType, type), sql`${bookClosingPeriods.periodStart} <= ${range.start} and ${bookClosingPeriods.periodEnd} >= ${range.end}`)).limit(1);
    if (parent) throw new AppError("CONFLICT", `Parent ${parent.periodType} ${parent.periodKey} masih tertutup`);

    let totals: ClosingTotals;
    if (type === "day") {
      const openSessions = await tx.select({ id: cashRegisterSessions.id }).from(cashRegisterSessions).innerJoin(cashRegisters, eq(cashRegisters.id, cashRegisterSessions.registerId)).where(and(eq(cashRegisters.branchId, branchId), eq(cashRegisterSessions.status, "open"), lt(cashRegisterSessions.openedAt, range.end)));
      if (openSessions.length) throw new AppError("CONFLICT", "Semua shift kasir harus settlement sebelum tutup buku harian", { details: { openSessionIds: openSessions.map((session) => session.id) } });
      totals = await aggregateDay(context.organizationId, branchId, range.start, range.end, tx as unknown as Database);
    } else {
      if (range.end > new Date()) throw new AppError("CONFLICT", `Periode ${type} belum berakhir`);
      const childType = type === "month" ? "day" : "month";
      const expected = type === "month" ? new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0).getDate() : 12;
      const children = await tx.select({ totals: bookClosingPeriods.totals }).from(bookClosingPeriods).where(and(eq(bookClosingPeriods.organizationId, context.organizationId), eq(bookClosingPeriods.branchId, branchId), eq(bookClosingPeriods.periodType, childType), eq(bookClosingPeriods.status, "closed"), gte(bookClosingPeriods.periodStart, range.start), lt(bookClosingPeriods.periodStart, range.end)));
      if (children.length !== expected) throw new AppError("CONFLICT", `Semua ${childType} harus ditutup terlebih dahulu`, { details: { expected, closed: children.length } });
      totals = children.reduce((sum, child) => addClosingTotals(sum, normalizeTotals(child.totals)), zeroClosingTotals());
    }

    const values = { organizationId: context.organizationId, branchId, periodType: type, periodKey: key, periodStart: range.start, periodEnd: range.end, timezone: branch.timezone, status: "closed" as const, totals: totals as unknown as Record<string, JsonValue>, closedBy: context.session.user.id, closedAt: new Date(), reopenedBy: null, reopenedAt: null, reopenReason: null, updatedAt: new Date() };
    const [closed] = existing
      ? await tx.update(bookClosingPeriods).set(values).where(eq(bookClosingPeriods.id, existing.id)).returning()
      : await tx.insert(bookClosingPeriods).values(values).returning();
    await writeAuditLog({ organizationId: context.organizationId, branchId, actorUserId: context.session.user.id, action: `book_closing.close_${type}`, resourceType: "book_closing_period", resourceId: closed.id, requestId: context.requestId, before: existing ? { status: existing.status } : undefined, after: { status: "closed", periodType: type, periodKey: key }, metadata: { totals: values.totals } }, tx as unknown as Database);
    return closed;
  });
}

export const closeDay = (input: z.infer<typeof closeDaySchema>, context: ApiContext) => closePeriod("day", input.date, input.branchId, context);
export const closeMonth = (input: z.infer<typeof closeMonthSchema>, context: ApiContext) => closePeriod("month", input.month, input.branchId, context);
export const closeYear = (input: z.infer<typeof closeYearSchema>, context: ApiContext) => closePeriod("year", input.year, input.branchId, context);

export async function reopenClosingPeriod(id: string, input: z.infer<typeof reopenPeriodSchema>, context: ApiContext) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`closing-reopen:${id}`}))`);
    const [period] = await tx.select().from(bookClosingPeriods).where(and(eq(bookClosingPeriods.id, id), eq(bookClosingPeriods.organizationId, context.organizationId))).limit(1);
    if (!period) throw new AppError("NOT_FOUND", "Periode tutup buku tidak ditemukan");
    if (period.status !== "closed") throw new AppError("CONFLICT", "Periode sudah dibuka kembali");
    const [closedParent] = await tx.select({ id: bookClosingPeriods.id, periodType: bookClosingPeriods.periodType, periodKey: bookClosingPeriods.periodKey }).from(bookClosingPeriods).where(and(eq(bookClosingPeriods.organizationId, context.organizationId), eq(bookClosingPeriods.branchId, period.branchId), eq(bookClosingPeriods.status, "closed"), ne(bookClosingPeriods.id, id), sql`${bookClosingPeriods.periodStart} <= ${period.periodStart} and ${bookClosingPeriods.periodEnd} >= ${period.periodEnd}`)).limit(1);
    if (closedParent) throw new AppError("CONFLICT", `Buka kembali parent ${closedParent.periodType} ${closedParent.periodKey} terlebih dahulu`);
    const [reopened] = await tx.update(bookClosingPeriods).set({ status: "reopened", reopenedBy: context.session.user.id, reopenedAt: new Date(), reopenReason: input.reason, updatedAt: new Date() }).where(eq(bookClosingPeriods.id, id)).returning();
    await writeAuditLog({ organizationId: context.organizationId, branchId: period.branchId, actorUserId: context.session.user.id, action: "book_closing.reopen", resourceType: "book_closing_period", resourceId: id, requestId: context.requestId, before: { status: "closed" }, after: { status: "reopened", reason: input.reason } }, tx as unknown as Database);
    return reopened;
  });
}

export async function listClosingPeriods(context: ApiContext) {
  return db.select().from(bookClosingPeriods).where(and(eq(bookClosingPeriods.organizationId, context.organizationId), ...(context.branchId ? [eq(bookClosingPeriods.branchId, context.branchId)] : []))).orderBy(desc(bookClosingPeriods.periodStart)).limit(200);
}
