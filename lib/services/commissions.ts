import { and, eq } from "drizzle-orm";
import type { Database } from "@/db";
import { employees, employeeCommissions } from "@/db/schema";

/**
 * Accrue a sales commission for the cashier who processed an order, if they are
 * registered as an employee with a commission rate. Creates a `pending` commission
 * entry that can later be approved/paid by management. Runs inside the caller's
 * transaction; silently skips if no matching employee or zero rate.
 */
export async function accrueCommission(database: Database, params: {
  organizationId: string;
  cashierUserId: string;
  orderId: string;
  totalAmount: bigint;
}): Promise<void> {
  const [employee] = await database
    .select({ id: employees.id, commissionRateBps: employees.commissionRateBps, employmentStatus: employees.employmentStatus })
    .from(employees)
    .where(and(eq(employees.organizationId, params.organizationId), eq(employees.userId, params.cashierUserId)))
    .limit(1);

  if (!employee || employee.employmentStatus !== "active" || employee.commissionRateBps <= 0) return;

  const rateBps = BigInt(employee.commissionRateBps);
  const commissionAmount = (params.totalAmount * rateBps) / 10000n;
  if (commissionAmount <= 0n) return;

  const now = new Date();
  const periodStart = now.toISOString().slice(0, 10); // today
  // Period end = end of current month
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const periodEnd = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  await database.insert(employeeCommissions).values({
    organizationId: params.organizationId,
    employeeId: employee.id,
    orderId: params.orderId,
    amount: commissionAmount,
    status: "pending",
    periodStart,
    periodEnd,
  });
}
