import { and, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Database } from "@/db";
import {
  cashMovements,
  cashRegisters,
  cashRegisterSessions,
  refunds,
  salesOrders,
  salesPayments,
  type JsonValue,
} from "@/db/schema";
import type { ApiContext } from "@/lib/api";
import { assertBranchAccess, assertPeriodOpen, AppError, writeAuditLog } from "@/lib/server";
import { calculateSettlement } from "./cash-settlement";
import type { DbTransaction } from "./stock-ledger";
import { ONLINE_RESERVATION_MS } from "@/lib/online-reservation-policy";
import { reservationExpiresAt } from "./stock-reservations";

export async function lockCashSession(tx: DbTransaction, sessionId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`cash-session:${sessionId}`}))`);
}

const nonnegativeMoney = z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative().safe()]).transform(BigInt);
const positiveMoney = nonnegativeMoney.refine((value) => value > 0n, "Nominal harus lebih dari nol");
const signedMoney = z.union([z.string().regex(/^-?\d+$/), z.number().int().safe()]).transform(BigInt);

export const openCashSessionSchema = z.object({
  branchId: z.string().uuid(),
  openingAmount: nonnegativeMoney,
  shiftHours: z.number().int().min(1).max(24).optional(),
});
export const cashMovementSchema = z.object({ direction: z.enum(["in", "out"]), amount: positiveMoney, category: z.string().min(2).max(100), reason: z.string().min(3).max(500) });
export const closeCashSessionSchema = z.object({
  tenderActuals: z.record(z.string(), signedMoney).refine((actuals) => (actuals.cash ?? 0n) >= 0n, "Kas aktual tidak boleh negatif"),
  notes: z.string().max(1_000).optional(),
});

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
  assertBranchAccess(context.tenant, input.branchId);
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

export async function getActiveCashSession(context: ApiContext, database: Database | DbTransaction = db) {
  const [session] = await database.select({
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
    await lockCashSession(tx, sessionId);
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

function getShiftRefunds(database: Database | DbTransaction, sessionId: string) {
  const method = sql<string>`coalesce(${salesPayments.method}, 'cash')`;
  return database.select({ method, amount: sql<string>`coalesce(sum(${refunds.amount}), 0)` })
    .from(refunds)
    .leftJoin(salesPayments, eq(salesPayments.id, refunds.paymentId))
    .where(and(eq(refunds.cashSessionId, sessionId), eq(refunds.status, "processed")))
    .groupBy(method);
}

export async function getCashSessionAmounts(sessionId: string, database: Database | DbTransaction = db) {
  const [paymentRows, refundRows, [changeRow], movementRows] = await Promise.all([
    database.select({ method: salesPayments.method, amount: sql<string>`coalesce(sum(${salesPayments.amount}), 0)` })
      .from(salesPayments).innerJoin(salesOrders, eq(salesOrders.id, salesPayments.orderId))
      .where(and(eq(salesOrders.cashSessionId, sessionId), eq(salesPayments.status, "settled"), ne(salesOrders.status, "cancelled")))
      .groupBy(salesPayments.method),
    getShiftRefunds(database, sessionId),
    database.select({ amount: sql<string>`coalesce(sum(${salesOrders.changeAmount}), 0)` })
      .from(salesOrders).where(eq(salesOrders.cashSessionId, sessionId)),
    database.select({ direction: cashMovements.direction, amount: sql<string>`coalesce(sum(${cashMovements.amount}), 0)` })
      .from(cashMovements).where(eq(cashMovements.sessionId, sessionId)).groupBy(cashMovements.direction),
  ]);
  return {
    payments: Object.fromEntries(paymentRows.map((row) => [row.method, BigInt(row.amount)])),
    refunds: Object.fromEntries(refundRows.map((row) => [row.method, BigInt(row.amount)])),
    cashChange: BigInt(changeRow?.amount ?? "0"),
    cashIn: BigInt(movementRows.find((row) => row.direction === "in")?.amount ?? "0"),
    cashOut: BigInt(movementRows.find((row) => row.direction === "out")?.amount ?? "0"),
  };
}

export async function closeCashSession(sessionId: string, input: z.infer<typeof closeCashSessionSchema>, context: ApiContext) {
  return db.transaction(async (tx) => {
    await lockCashSession(tx, sessionId);
    const [session] = await tx.select({ id: cashRegisterSessions.id, userId: cashRegisterSessions.userId, status: cashRegisterSessions.status, openingAmount: cashRegisterSessions.openingAmount, openedAt: cashRegisterSessions.openedAt, branchId: cashRegisters.branchId }).from(cashRegisterSessions).innerJoin(cashRegisters, eq(cashRegisters.id, cashRegisterSessions.registerId)).where(and(
       eq(cashRegisterSessions.id, sessionId),
       eq(cashRegisterSessions.organizationId, context.organizationId),
       ...(context.branchId ? [eq(cashRegisters.branchId, context.branchId)] : []),
     )).limit(1);
    if (!session) throw new AppError("NOT_FOUND", "Shift kasir tidak ditemukan");
    if (session.status !== "open") throw new AppError("CONFLICT", "Shift kasir sudah ditutup");
    if (session.userId !== context.session.user.id && context.tenant.role !== "owner") throw new AppError("FORBIDDEN", "Hanya pemilik shift atau owner yang dapat settlement");
    await assertPeriodOpen(tx, { organizationId: context.organizationId, branchId: session.branchId });

    const pendingOnline = await tx.select({ metadata: salesOrders.metadata, occurredAt: salesOrders.occurredAt }).from(salesOrders)
      .innerJoin(salesPayments, eq(salesPayments.orderId, salesOrders.id))
      .where(and(
        eq(salesOrders.cashSessionId, sessionId),
        eq(salesOrders.status, "pending"),
        isNotNull(salesPayments.provider),
        inArray(salesPayments.status, ["pending", "authorized"]),
      ));
    const now = Date.now();
    if (pendingOnline.some(({ metadata, occurredAt }) =>
      (reservationExpiresAt(metadata)?.getTime() ?? occurredAt.getTime() + ONLINE_RESERVATION_MS) > now,
    )) throw new AppError("CONFLICT", "Tunggu pembayaran online selesai atau pesanan kedaluwarsa sebelum menutup shift");

    const amounts = await getCashSessionAmounts(sessionId, tx);
    const { payments, refunds: refundByMethod } = amounts;
    const requiredMethods = new Set(["cash", ...Object.keys(payments), ...Object.keys(refundByMethod)]);
    const missing = [...requiredMethods].filter((method) => input.tenderActuals[method] === undefined);
    if (missing.length) throw new AppError("VALIDATION_ERROR", `Actual settlement wajib diisi untuk: ${missing.join(", ")}`);
    const settlement = calculateSettlement({ ...amounts, openingAmount: session.openingAmount, actuals: input.tenderActuals });
    const paymentBreakdown = Object.fromEntries(Object.entries(settlement.breakdown).map(([method, value]) => [method, { expected: value.expected.toString(), actual: value.actual.toString(), variance: value.variance.toString(), paid: (payments[method] ?? 0n).toString(), refunded: (refundByMethod[method] ?? 0n).toString() }])) as Record<string, JsonValue>;
    const [closed] = await tx.update(cashRegisterSessions).set({ status: "closed", expectedClosingAmount: settlement.expectedCash, actualClosingAmount: settlement.actualCash, varianceAmount: settlement.cashVariance, paymentBreakdown, settlementNotes: input.notes, settledBy: context.session.user.id, closedAt: new Date(), updatedAt: new Date() }).where(eq(cashRegisterSessions.id, sessionId)).returning();
    await writeAuditLog({ organizationId: context.organizationId, branchId: session.branchId, actorUserId: context.session.user.id, action: "cash_session.close", resourceType: "cash_register_session", resourceId: sessionId, requestId: context.requestId, before: { status: "open" }, after: { status: "closed", expectedCash: settlement.expectedCash.toString(), actualCash: settlement.actualCash.toString(), variance: settlement.cashVariance.toString() }, metadata: { paymentBreakdown } }, tx as unknown as Database);
    return closed;
  });
}

/**
 * Preview the expected settlement for an open cash session WITHOUT closing it.
 * Returns the expected breakdown per payment method so the cashier can see
 * what the system expects before entering actuals.
 */
export async function previewSettlement(sessionId: string, context: ApiContext) {
  const [session] = await db.select({
    id: cashRegisterSessions.id, status: cashRegisterSessions.status,
    openingAmount: cashRegisterSessions.openingAmount, openedAt: cashRegisterSessions.openedAt,
    branchId: cashRegisters.branchId,
  }).from(cashRegisterSessions).innerJoin(cashRegisters, eq(cashRegisters.id, cashRegisterSessions.registerId)).where(and(
    eq(cashRegisterSessions.id, sessionId),
    eq(cashRegisterSessions.organizationId, context.organizationId),
    ...(context.branchId ? [eq(cashRegisters.branchId, context.branchId)] : []),
  )).limit(1);
  if (!session) throw new AppError("NOT_FOUND", "Shift kasir tidak ditemukan");
  if (session.status !== "open") throw new AppError("CONFLICT", "Shift kasir sudah ditutup");

  const amounts = await getCashSessionAmounts(sessionId);
  const settlement = calculateSettlement({ ...amounts, openingAmount: session.openingAmount, actuals: {} });
  const breakdown = Object.fromEntries(Object.entries(settlement.breakdown).map(([method, value]) => [method, {
    expected: value.expected.toString(),
    paid: (amounts.payments[method] ?? 0n).toString(),
    refunded: (amounts.refunds[method] ?? 0n).toString(),
  }]));
  return {
    openingAmount: session.openingAmount.toString(),
    cashChange: amounts.cashChange.toString(),
    cashIn: amounts.cashIn.toString(),
    cashOut: amounts.cashOut.toString(),
    expectedCash: settlement.expectedCash.toString(),
    breakdown,
  };
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
