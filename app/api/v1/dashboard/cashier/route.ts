import { sql } from "drizzle-orm";
import { db } from "@/db";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";

export const GET = apiHandler(async (request) => {
  const context = await requireApiContext(request, "dashboard:read");
  const branchFilter = context.branchId ? sql`and branch_id = ${context.branchId}` : sql``;
  const [summary, recentSales] = await Promise.all([
    db.execute(sql`select coalesce(sum(total_amount), 0)::text as sales, count(*)::int as orders, count(distinct customer_id)::int as customers from sales_orders where organization_id = ${context.organizationId} ${branchFilter} and cashier_user_id = ${context.session.user.id} and status in ('paid', 'partially_refunded', 'refunded') and occurred_at >= date_trunc('day', now())`),
    db.execute(sql`select so.id, so.order_number, so.total_amount::text as total_amount, so.status, coalesce(c.name, 'Pelanggan umum') as customer_name, coalesce(string_agg(distinct sp.method, ', '), '') as payment_methods, coalesce(string_agg(distinct soi.item_name, ', '), 'Transaksi tanpa item') as product_names from sales_orders so left join customers c on c.id = so.customer_id left join sales_payments sp on sp.order_id = so.id left join sales_order_items soi on soi.order_id = so.id where so.organization_id = ${context.organizationId} ${branchFilter} and so.cashier_user_id = ${context.session.user.id} group by so.id, c.name order by so.occurred_at desc limit 10`),
  ]);
  return dataResponse({ summary: summary.rows[0], recentSales: recentSales.rows });
});
