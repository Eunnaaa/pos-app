import { sql } from "drizzle-orm";
import { db } from "@/db";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";

const rupiah = (v: string | number | bigint) => `Rp ${Number(v).toLocaleString("id-ID")}`;

export const GET = apiHandler(async (request) => {
  const context = await requireApiContext(request, "finance:read");
  const branchFilter = context.branchId ? sql`and branch_id = ${context.branchId}` : sql``;
  const orgId = context.organizationId;

  const [sales, expenseRow, cashBalance, payments, movements] = await Promise.all([
    db.execute(sql`
      select coalesce(sum(total_amount), 0)::text as total_sales,
             coalesce(sum(total_amount - cost_amount), 0)::text as total_profit,
             count(*)::int as total_orders
      from sales_orders
      where organization_id = ${orgId} ${branchFilter}
        and status in ('paid','partially_refunded','refunded')
        and occurred_at >= date_trunc('day', now())
    `),
    db.execute(sql`
      select coalesce(sum(amount), 0)::text as total_expenses
      from expenses
      where organization_id = ${orgId} ${branchFilter}
        and status in ('approved','paid')
        and expense_date = date_trunc('day', now())::date
    `),
    db.execute(sql`
      select coalesce(sum(current_balance_amount), 0)::text as balance
      from financial_accounts
      where organization_id = ${orgId} and type in ('cash','bank') and is_active = true
    `),
    db.execute(sql`
      select sp.method, coalesce(sum(sp.amount), 0)::text as amount, count(*)::int as count
      from sales_payments sp
      join sales_orders so on so.id = sp.order_id
      where so.organization_id = ${orgId} ${branchFilter}
        and sp.status in ('settled','authorized')
        and sp.paid_at >= date_trunc('day', now())
      group by sp.method order by sum(sp.amount) desc limit 5
    `),
    db.execute(sql`
      select coalesce(sum(case when direction = 'in' then amount else 0 end), 0)::text as cash_in,
             coalesce(sum(case when direction = 'out' then amount else 0 end), 0)::text as cash_out
      from cash_movements cm
      join cash_register_sessions crs on crs.id = cm.session_id
      where cm.organization_id = ${orgId} and cm.created_at >= date_trunc('day', now())
    `),
  ]);

  const s = sales.rows[0] as Record<string, unknown> | undefined;
  const e = expenseRow.rows[0] as Record<string, unknown> | undefined;
  const c = cashBalance.rows[0] as Record<string, unknown> | undefined;
  const m = movements.rows[0] as Record<string, unknown> | undefined;
  const totalSales = BigInt((s?.total_sales as string) || "0");
  const totalExpenses = BigInt((e?.total_expenses as string) || "0");
  const netProfit = totalSales - totalExpenses;

  return dataResponse({
    today: {
      totalSales: rupiah(totalSales),
      totalProfit: rupiah(BigInt((s?.total_profit as string) || "0")),
      totalExpenses: rupiah(totalExpenses),
      netProfit: rupiah(netProfit),
      totalOrders: (s?.total_orders as number) || 0,
    },
    cashBalance: rupiah(BigInt((c?.balance as string) || "0")),
    cashMovements: {
      in: rupiah(BigInt((m?.cash_in as string) || "0")),
      out: rupiah(BigInt((m?.cash_out as string) || "0")),
    },
    paymentMethods: payments.rows,
  });
});
