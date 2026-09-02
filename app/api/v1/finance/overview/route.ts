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
      select coalesce(sum(so.total_amount - coalesce(rr.refund_amount, 0)), 0)::text as total_sales,
             coalesce(sum(so.total_amount - coalesce(rr.refund_amount, 0) - so.cost_amount), 0)::text as total_profit,
             count(*)::int as total_orders
      from sales_orders so
      left join (
        select sr.order_id, sum(r.amount) as refund_amount
        from refunds r
        join sales_returns sr on sr.id = r.return_id
        where r.status = 'processed'
        group by sr.order_id
      ) rr on rr.order_id = so.id
      where so.organization_id = ${orgId} ${context.branchId ? sql`and so.branch_id = ${context.branchId}` : sql``}
        and so.status in ('paid','partially_refunded','refunded')
        and so.occurred_at >= date_trunc('day', now())
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
      with payment_flows as (
        select sp.method, sp.amount as amount, 1::int as payment_count
        from sales_payments sp
        join sales_orders so on so.id = sp.order_id
        where so.organization_id = ${orgId}
          ${context.branchId ? sql`and so.branch_id = ${context.branchId}` : sql``}
          and sp.status = 'settled'
          and so.status in ('paid','partially_refunded','refunded')
          and so.occurred_at >= date_trunc('day', now())
        union all
        select coalesce(sp.method, 'refund') as method, -r.amount as amount, 0::int as payment_count
        from refunds r
        join sales_returns sr on sr.id = r.return_id
        join sales_orders so on so.id = sr.order_id
        left join sales_payments sp on sp.id = r.payment_id
        where r.organization_id = ${orgId}
          ${context.branchId ? sql`and so.branch_id = ${context.branchId}` : sql``}
          and r.status = 'processed'
          and so.occurred_at >= date_trunc('day', now())
      )
      select method, coalesce(sum(amount), 0)::text as amount, sum(payment_count)::int as count
      from payment_flows
      group by method order by sum(amount) desc limit 5
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
  const grossProfit = BigInt((s?.total_profit as string) || "0");
  const netProfit = grossProfit - totalExpenses;

  return dataResponse({
    today: {
      totalSales: rupiah(totalSales),
      totalProfit: rupiah(grossProfit),
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
