import { and, eq, gt, lte, or } from "drizzle-orm";
import type { Database } from "@/db";
import { bookClosingPeriods } from "@/db/schema";
import type { DbTransaction } from "@/lib/services/stock-ledger";
import { AppError } from "./errors";

type ClosingDatabase = Database | DbTransaction;

export async function assertPeriodOpen(
  database: ClosingDatabase,
  input: { organizationId: string; branchId: string; at?: Date },
): Promise<void> {
  const at = input.at ?? new Date();
  const [closed] = await database
    .select({ id: bookClosingPeriods.id, periodType: bookClosingPeriods.periodType, periodKey: bookClosingPeriods.periodKey })
    .from(bookClosingPeriods)
    .where(and(
      eq(bookClosingPeriods.organizationId, input.organizationId),
      eq(bookClosingPeriods.branchId, input.branchId),
      eq(bookClosingPeriods.status, "closed"),
      lte(bookClosingPeriods.periodStart, at),
      gt(bookClosingPeriods.periodEnd, at),
    ))
    .limit(1);
  if (closed) {
    throw new AppError("CONFLICT", `Periode ${closed.periodType} ${closed.periodKey} sudah ditutup`, {
      details: { periodId: closed.id, periodType: closed.periodType, periodKey: closed.periodKey },
    });
  }
}

export async function assertAccountingDateOpen(
  database: ClosingDatabase,
  input: { organizationId: string; branchId: string; date: string },
): Promise<void> {
  const [closed] = await database
    .select({ id: bookClosingPeriods.id, periodType: bookClosingPeriods.periodType, periodKey: bookClosingPeriods.periodKey })
    .from(bookClosingPeriods)
    .where(and(
      eq(bookClosingPeriods.organizationId, input.organizationId),
      eq(bookClosingPeriods.branchId, input.branchId),
      eq(bookClosingPeriods.status, "closed"),
      or(
        and(eq(bookClosingPeriods.periodType, "day"), eq(bookClosingPeriods.periodKey, input.date)),
        and(eq(bookClosingPeriods.periodType, "month"), eq(bookClosingPeriods.periodKey, input.date.slice(0, 7))),
        and(eq(bookClosingPeriods.periodType, "year"), eq(bookClosingPeriods.periodKey, input.date.slice(0, 4))),
      ),
    ))
    .limit(1);
  if (closed) throw new AppError("CONFLICT", `Periode ${closed.periodType} ${closed.periodKey} sudah ditutup`);
}
