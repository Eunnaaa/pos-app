import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@/db";
import { financialAccounts, financialTransactions } from "@/db/schema";

type LedgerDB = Database;
type AccountInfo = { id: string; type: string };

const DEFAULT_ACCOUNTS = [
  { code: "CASH", name: "Kas", type: "cash" as const },
  { code: "BANK", name: "Bank & E-Wallet", type: "bank" as const },
  { code: "SALES-INCOME", name: "Pendapatan Penjualan", type: "income" as const },
  { code: "OPERATING-EXPENSE", name: "Beban Operasional", type: "expense" as const },
] as const;

// Account types where debit increases balance (assets & expenses)
const DEBIT_POSITIVE = new Set(["cash", "bank", "receivable", "expense"]);

async function ensureDefaultAccounts(organizationId: string, database: LedgerDB): Promise<Record<string, AccountInfo>> {
  const map: Record<string, AccountInfo> = {};
  for (const def of DEFAULT_ACCOUNTS) {
    const [existing] = await database
      .select({ id: financialAccounts.id, type: financialAccounts.type })
      .from(financialAccounts)
      .where(and(eq(financialAccounts.organizationId, organizationId), eq(financialAccounts.code, def.code)))
      .limit(1);
    if (existing) { map[def.code] = { id: existing.id, type: existing.type }; continue; }
    const [created] = await database
      .insert(financialAccounts)
      .values({ organizationId, code: def.code, name: def.name, type: def.type, currency: "IDR", openingBalanceAmount: 0n, currentBalanceAmount: 0n })
      .onConflictDoNothing()
      .returning({ id: financialAccounts.id, type: financialAccounts.type });
    if (created) { map[def.code] = { id: created.id, type: created.type }; continue; }
    const [reload] = await database
      .select({ id: financialAccounts.id, type: financialAccounts.type })
      .from(financialAccounts)
      .where(and(eq(financialAccounts.organizationId, organizationId), eq(financialAccounts.code, def.code)))
      .limit(1);
    if (reload) map[def.code] = { id: reload.id, type: reload.type };
  }
  return map;
}

async function updateBalance(database: LedgerDB, accountId: string, accountType: string, direction: "debit" | "credit", amount: bigint): Promise<void> {
  const delta = (direction === "debit" && DEBIT_POSITIVE.has(accountType)) || (direction === "credit" && !DEBIT_POSITIVE.has(accountType)) ? amount : -amount;
  await database.update(financialAccounts)
    .set({ currentBalanceAmount: sql`${financialAccounts.currentBalanceAmount} + ${delta}`, updatedAt: new Date() })
    .where(eq(financialAccounts.id, accountId));
}

async function postEntry(database: LedgerDB, input: {
  organizationId: string; branchId: string | null; accountId: string; accountType: string;
  transactionNumber: string; type: "income" | "expense" | "transfer" | "adjustment";
  direction: "debit" | "credit"; amount: bigint; description: string;
  referenceType: string; referenceId: string; actorUserId: string;
}): Promise<void> {
  await database.insert(financialTransactions).values({
    organizationId: input.organizationId, branchId: input.branchId,
    accountId: input.accountId, transactionNumber: input.transactionNumber,
    type: input.type, direction: input.direction, amount: input.amount,
    description: input.description, referenceType: input.referenceType, referenceId: input.referenceId,
    transactionDate: todayDate(), createdBy: input.actorUserId,
  });
  await updateBalance(database, input.accountId, input.accountType, input.direction, input.amount);
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function methodToAccountCode(method: string): string {
  return method === "cash" ? "CASH" : "BANK";
}

export async function postSaleToLedger(database: LedgerDB, input: {
  organizationId: string;
  branchId: string;
  orderId: string;
  orderNumber: string;
  totalAmount: bigint;
  changeAmount: bigint;
  payments: Array<{ method: string; amount: bigint }>;
  actorUserId: string;
}): Promise<void> {
  const accounts = await ensureDefaultAccounts(input.organizationId, database);
  const income = accounts["SALES-INCOME"];
  const cash = accounts["CASH"];

  // Credit income account for total sale
  await postEntry(database, {
    organizationId: input.organizationId, branchId: input.branchId, accountId: income.id, accountType: income.type,
    transactionNumber: `FT-SALE-${input.orderNumber}`, type: "income", direction: "credit", amount: input.totalAmount,
    description: `Penjualan ${input.orderNumber}`, referenceType: "sales_order", referenceId: input.orderId, actorUserId: input.actorUserId,
  });

  // Debit payment method accounts
  for (const payment of input.payments) {
    const acct = accounts[methodToAccountCode(payment.method)];
    await postEntry(database, {
      organizationId: input.organizationId, branchId: input.branchId, accountId: acct.id, accountType: acct.type,
      transactionNumber: `FT-SALE-${input.orderNumber}-${payment.method}`, type: "income", direction: "debit", amount: payment.amount,
      description: `Pembayaran ${payment.method} ${input.orderNumber}`, referenceType: "sales_order", referenceId: input.orderId, actorUserId: input.actorUserId,
    });
  }

  // Credit cash for change given back
  if (input.changeAmount > 0n) {
    await postEntry(database, {
      organizationId: input.organizationId, branchId: input.branchId, accountId: cash.id, accountType: cash.type,
      transactionNumber: `FT-SALE-${input.orderNumber}-CHANGE`, type: "adjustment", direction: "credit", amount: input.changeAmount,
      description: `Kembalian ${input.orderNumber}`, referenceType: "sales_order", referenceId: input.orderId, actorUserId: input.actorUserId,
    });
  }
}

export async function postReturnToLedger(database: LedgerDB, input: {
  organizationId: string;
  branchId: string;
  returnId: string;
  returnNumber: string;
  refundAmount: bigint;
  paymentMethod?: string;
  actorUserId: string;
}): Promise<void> {
  const accounts = await ensureDefaultAccounts(input.organizationId, database);
  const income = accounts["SALES-INCOME"];
  const refundAcct = accounts[methodToAccountCode(input.paymentMethod ?? "cash")];

  // Debit income (reverse the sale)
  await postEntry(database, {
    organizationId: input.organizationId, branchId: input.branchId, accountId: income.id, accountType: income.type,
    transactionNumber: `FT-RET-${input.returnNumber}`, type: "adjustment", direction: "debit", amount: input.refundAmount,
    description: `Pengembalian ${input.returnNumber}`, referenceType: "sales_return", referenceId: input.returnId, actorUserId: input.actorUserId,
  });

  // Credit the payment method account (refund out)
  await postEntry(database, {
    organizationId: input.organizationId, branchId: input.branchId, accountId: refundAcct.id, accountType: refundAcct.type,
    transactionNumber: `FT-RET-${input.returnNumber}-${input.paymentMethod ?? "cash"}`, type: "adjustment", direction: "credit", amount: input.refundAmount,
    description: `Pengembalian ${input.returnNumber}`, referenceType: "sales_return", referenceId: input.returnId, actorUserId: input.actorUserId,
  });
}

export async function postExpenseToLedger(database: LedgerDB, input: {
  organizationId: string;
  branchId?: string;
  expenseId: string;
  expenseNumber: string;
  amount: bigint;
  category: string;
  actorUserId: string;
}): Promise<void> {
  const accounts = await ensureDefaultAccounts(input.organizationId, database);
  const expense = accounts["OPERATING-EXPENSE"];
  const cash = accounts["CASH"];

  // Debit expense account
  await postEntry(database, {
    organizationId: input.organizationId, branchId: input.branchId ?? null, accountId: expense.id, accountType: expense.type,
    transactionNumber: `FT-EXP-${input.expenseNumber}`, type: "expense", direction: "debit", amount: input.amount,
    description: `Pengeluaran ${input.category} - ${input.expenseNumber}`, referenceType: "expense", referenceId: input.expenseId, actorUserId: input.actorUserId,
  });

  // Credit cash account
  await postEntry(database, {
    organizationId: input.organizationId, branchId: input.branchId ?? null, accountId: cash.id, accountType: cash.type,
    transactionNumber: `FT-EXP-${input.expenseNumber}-CASH`, type: "expense", direction: "credit", amount: input.amount,
    description: `Pembayaran pengeluaran ${input.expenseNumber}`, referenceType: "expense", referenceId: input.expenseId, actorUserId: input.actorUserId,
  });
}
