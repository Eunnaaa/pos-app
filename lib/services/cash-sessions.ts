import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Database } from "@/db";
import {
  cashMovements,
  cashRegisters,
  cashRegisterSessions,
  refunds,
  salesOrders,
  salesPayments,
  salesReturns,
  type JsonValue,
} from "@/db/schema";
import type { ApiContext } from "@/lib/api";
import { assertPeriodOpen, AppError, writeAuditLog } from "@/lib/server";
import { calculateSettlement } from "./cash-settlement";

const nonnegativeMoney = z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative().safe()]).transform(BigInt);
const positiveMoney = nonnegativeMoney.refine((value) => value > 0n, "Nominal harus lebih dari nol");

export const openCashSessionSchema = z.object({
  branchId: z.string().uuid(),
  openingAmount: nonnegativeMoney,
  shiftHours: z.number().int().min(1).max(24).optional(),
});
export const cashMovementSchema = z.object({ direction: z.enum(["in", "out"]), amount: positiveMoney, category: z.string().min(2).max(100), reason: z.string().min(3).max(500) });
export const closeCashSessionSchema = z.object({ tenderActuals: z.record(z.string(), nonnegativeMoney), notes: z.string().max(1_000).optional() });

async function getRegisterForBranch(branchId: string, organizationId: string, database: Database = db) {
  const where = and(eq(cashRegisters.organizationId, organizationId), eq(cashRegisters.branchId, branchId), eq(cashRegisters.isActive, true));
  const [existing] = await database.select().from(cashRegisters).where(where).limit(1);
  if (existing) return existing;
  const [created] = await database.insert(cashRegisters).values({ organizationId, branchId, name: "Mesin Kasir Default", code: "DEFAULT", isActive: true }).onConflictDoNothing().returning();
  if (created) return created;
  const [reload] = await database.select().from(cashRegisters).where(where).limit(1);
  return reload!;
}

export async function openCashSession(input: z.infer<typeof openCashSessionSchema>, context: ApiContext) {
  return db.transaction(async (tx) => {
    const register = await getRegisterForBranch(input.branchId, context.organizationId, tx as unknown as Database);
    await assertPeriodOpen(tx, { organizationId: context.organizationId, branchId: register.branchId });
    const [existing] = await tx.select({ id: cashRegisterSessions.id }).from(cashRegisterSessions).where(and(eq(cashRegisterSessions.registerId, register.id), eq(cashRegisterSessions.status, "open"))).limit(1);
    if (existing) throw new AppError("CONFLICT", "Cash register masih memiliki shift terbuka", { details: { sessionId: existing.id } });
    const [session] = await tx.insert(cashRegisterSessions).values({ organizationId: context.organizationId, registerId: register.id, userId: context.session.user.id, openingAmount: input.openingAmount, shiftHours: input.shiftHours }).returning();
    await writeAuditLog({ organizationId: context.organizationId, branchId: register.branchId, actorUserId: context.session.user.id, action: "cash_session.open", resourceType: "cash_register_session", resourceId: session.id, requestId: context.requestId, after: { openingAmount: input.openingAmount.toString(), shiftHours: input.shiftHours ?? null, status: "open" } }, tx as unknown as Database);
    return { ...session, registerName: register.name, registerCode: register.code, branchId: register.branchId };
  });
}

export async function getActiveCashSession(context: ApiContext) {
  const [session] = await db.select({
    id: cashRegisterSessions.id,
    status: cashRegisterSessions.status,
    openingAmount: cashRegisterSessions.openingAmount,
    shiftHours: cashRegisterSessions.shiftHours,
    openedAt: cashRegisterSessions.openedAt,
    registerId: cashRegisters.id,
    registerName: cashRegisters.name,
    registerCode: cashRegisters.code,
    branchId: cashRegisters.branchId,
  }).from(cashRegisterSessions).innerJoin(cashRegisters, eq(cashRegisters.id, cashRegisterSessions.registerId)).where(and(
    eq(cashRegisterSessions.organizationId, context.organizationId),
    eq(cashRegisterSessions.userId, context.session.user.id),
    eq(cashRegisterSessions.status, "open"),
    ...(context.branchId ? [eq(cashRegisters.branchId, context.branchId)] : []),
  )).orderBy(desc(cashRegisterSessions.openedAt)).limit(1);
  return session ?? null;
}

export async function recordCashMovement(sessionId: string, input: z.infer<typeof cashMovementSchema>, context: ApiContext) {
  return db.transaction(async (tx) => {
    const [session] = await tx.select({ id: cashRegisterSessions.id, userId: cashRegisterSessions.userId, status: cashRegisterSessions.status, branchId: cashRegisters.branchId }).from(cashRegisterSessions).innerJoin(cashRegisters, eq(cashRegisters.id, cashRegisterSessions.registerId)).where(and(
       eq(cashRegisterSessions.id, sessionId),
       eq(cashRegisterSessions.organizationId, context.organizationId),
       ...(context.branchId ? [eq(cashRegisters.branchId, context.branchId)] : []),
     )).limit(1);
    if (!session) throw new AppError("NOT_FOUND", "Shift kasir tidak ditemukan");
    if (session.status !== "open") throw new AppError("CONFLICT", "Shift kasir sudah ditutup");
    if (session.userId !== context.session.user.id && context.tenant.role !== "owner") throw new AppError("FORBIDDEN", "Hanya pemilik shift atau owner yang dapat mencatat pergerakan kas");
    await assertPeriodOpen(tx, { organizationId: context.organizationId, branchId: session.branchId });
    const [movement] = await tx.insert(cashMovements).values({ organizationId: context.organizationId, sessionId, direction: input.direction, amount: input.amount, category: input.category, reason: input.reason, actorUserId: context.session.user.id }).returning();
    await writeAuditLog({ organizationId: context.organizationId, branchId: session.branchId, actorUserId: context.session.user.id, action: `cash_movement.${input.direction}`, resourceType: "cash_movement", resourceId: movement.id, requestId: context.requestId, after: { amount: input.amount.toString(), category: input.category, reason: input.reason } }, tx as unknown as Database);
    return movement;
  });
}

export async function closeCashSession(sessionId: string, input: z.infer<typeof closeCashSessionSchema>, context: ApiContext) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`cash-session:${sessionId}`}))`);
    const [session] = await tx.select({ id: cashRegisterSessions.id, userId: cashRegisterSessions.userId, status: cashRegisterSessions.status, openingAmount: cashRegisterSessions.openingAmount, openedAt: cashRegisterSessions.openedAt, branchId: cashRegisters.branchId }).from(cashRegisterSessions).innerJoin(cashRegisters, eq(cashRegisters.id, cashRegisterSessions.registerId)).where(and(
       eq(cashRegisterSessions.id, sessionId),
       eq(cashRegisterSessions.organizationId, context.organizationId),
       ...(context.branchId ? [eq(cashRegisters.branchId, context.branchId)] : []),
     )).limit(1);
    if (!session) throw new AppError("NOT_FOUND", "Shift kasir tidak ditemukan");
    if (session.status !== "open") throw new AppError("CONFLICT", "Shift kasir sudah ditutup");
    if (session.userId !== context.session.user.id && context.tenant.role !== "owner") throw new AppError("FORBIDDEN", "Hanya pemilik shift atau owner yang dapat settlement");
    await assertPeriodOpen(tx, { organizationId: context.organizationId, branchId: session.branchId });

    const paymentRows = await tx.select({ method: salesPayments.method, amount: sql<string>`coalesce(sum(${salesPayments.amount}), 0)` }).from(salesPayments).innerJoin(salesOrders, eq(salesOrders.id, salesPayments.orderId)).where(and(eq(salesOrders.cashSessionId, sessionId), inArray(salesPayments.status, ["settled", "authorized"]))).groupBy(salesPayments.method);
    const refundRows = await tx.select({ method: salesPayments.method, amount: sql<string>`coalesce(sum(${refunds.amount}), 0)` }).from(refunds).innerJoin(salesReturns, eq(salesReturns.id, refunds.returnId)).innerJoin(salesOrders, eq(salesOrders.id, salesReturns.orderId)).leftJoin(salesPayments, eq(salesPayments.id, refunds.paymentId)).where(and(eq(salesOrders.cashSessionId, sessionId), eq(refunds.status, "processed"))).groupBy(salesPayments.method);
    const [changeRow] = await tx.select({ amount: sql<string>`coalesce(sum(${salesOrders.changeAmount}), 0)` }).from(salesOrders).where(eq(salesOrders.cashSessionId, sessionId));
    const movementRows = await tx.select({ direction: cashMovements.direction, amount: sql<string>`coalesce(sum(${cashMovements.amount}), 0)` }).from(cashMovements).where(eq(cashMovements.sessionId, sessionId)).groupBy(cashMovements.direction);
    const payments = Object.fromEntries(paymentRows.map((row) => [row.method, BigInt(row.amount)]));
    const refundByMethod = Object.fromEntries(refundRows.map((row) => [row.method ?? "unassigned_refund", BigInt(row.amount)]));
    const cashIn = BigInt(movementRows.find((row) => row.direction === "in")?.amount ?? "0");
    const cashOut = BigInt(movementRows.find((row) => row.direction === "out")?.amount ?? "0");
    const requiredMethods = new Set(["cash", ...Object.keys(payments)]);
    const missing = [...requiredMethods].filter((method) => input.tenderActuals[method] === undefined);
    if (missing.length) throw new AppError("VALIDATION_ERROR", `Actual settlement wajib diisi untuk: ${missing.join(", ")}`);
    const settlement = calculateSettlement({ openingAmount: session.openingAmount, payments, refunds: refundByMethod, cashChange: BigInt(changeRow?.amount ?? "0"), cashIn, cashOut, actuals: input.tenderActuals });
    const paymentBreakdown = Object.fromEntries(Object.entries(settlement.breakdown).map(([method, value]) => [method, { expected: value.expected.toString(), actual: value.actual.toString(), variance: value.variance.toString(), paid: (payments[method] ?? 0n).toString(), refunded: (refundByMethod[method] ?? 0n).toString() }])) as Record<string, JsonValue>;
    const [closed] = await tx.update(cashRegisterSessions).set({ status: "closed", expectedClosingAmount: settlement.expectedCash, actualClosingAmount: settlement.actualCash, varianceAmount: settlement.cashVariance, paymentBreakdown, settlementNotes: input.notes, settledBy: context.session.user.id, closedAt: new Date(), updatedAt: new Date() }).where(eq(cashRegisterSessions.id, sessionId)).returning();
    await writeAuditLog({ organizationId: context.organizationId, branchId: session.branchId, actorUserId: context.session.user.id, action: "cash_session.close", resourceType: "cash_register_session", resourceId: sessionId, requestId: context.requestId, before: { status: "open" }, after: { status: "closed", expectedCash: settlement.expectedCash.toString(), actualCash: settlement.actualCash.toString(), variance: settlement.cashVariance.toString() }, metadata: { paymentBreakdown } }, tx as unknown as Database);
    return closed;
  });
}

export async function listCashSessions(context: ApiContext) {
  return db.select({
    id: cashRegisterSessions.id, status: cashRegisterSessions.status, openingAmount: cashRegisterSessions.openingAmount,
    shiftHours: cashRegisterSessions.shiftHours,
    expectedClosingAmount: cashRegisterSessions.expectedClosingAmount, actualClosingAmount: cashRegisterSessions.actualClosingAmount,
    varianceAmount: cashRegisterSessions.varianceAmount, paymentBreakdown: cashRegisterSessions.paymentBreakdown,
    openedAt: cashRegisterSessions.openedAt, closedAt: cashRegisterSessions.closedAt, userId: cashRegisterSessions.userId,
    registerId: cashRegisters.id, registerName: cashRegisters.name, registerCode: cashRegisters.code, branchId: cashRegisters.branchId,
  }).from(cashRegisterSessions).innerJoin(cashRegisters, eq(cashRegisters.id, cashRegisterSessions.registerId)).where(and(eq(cashRegisterSessions.organizationId, context.organizationId), ...(context.branchId ? [eq(cashRegisters.branchId, context.branchId)] : []))).orderBy(desc(cashRegisterSessions.openedAt)).limit(100);
}
