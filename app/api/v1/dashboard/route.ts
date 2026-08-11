import { sql } from "drizzle-orm";
import { db } from "@/db";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";

export const GET = apiHandler(async (request) => {
  const context = await requireApiContext(request, "dashboard:read");
  const [summary, trend, topProducts, lowStock, recentSales] = await Promise.all([
    db.execute(sql`
      select coalesce(sum(total_amount), 0)::text as sales,
             coalesce(sum(total_amount - cost_amount), 0)::text as profit,
             count(*)::int as orders,
             count(distinct customer_id)::int as customers
      from sales_orders
      where organization_id = ${context.organizationId}
        ${context.branchId ? sql`and branch_id = ${context.branchId}` : sql``}
        and status in ('paid', 'partially_refunded', 'refunded')
        and occurred_at >= date_trunc('day', now())
    `),
    db.execute(sql`
      select to_char(date_trunc('day', occurred_at), 'YYYY-MM-DD') as date,
             sum(total_amount)::text as sales,
             count(*)::int as orders
      from sales_orders
       where organization_id = ${context.organizationId}
         ${context.branchId ? sql`and branch_id = ${context.branchId}` : sql``}
         and occurred_at >= now() - interval '30 days'
        and status in ('paid', 'partially_refunded', 'refunded')
      group by date_trunc('day', occurred_at)
      order by date_trunc('day', occurred_at)
    `),
    db.execute(sql`
       select soi.item_name as name, sum(soi.quantity)::text as quantity, sum(soi.total_amount)::text as sales
       from sales_order_items soi
       join sales_orders so on so.id = soi.order_id
       where soi.organization_id = ${context.organizationId}
         ${context.branchId ? sql`and so.branch_id = ${context.branchId}` : sql``}
         and so.status in ('paid', 'partially_refunded', 'refunded')
       group by item_name order by sum(quantity) desc limit 5
    `),
    db.execute(sql`
      select pv.id, p.name, pv.name as variant, sb.available::text as available, sb.reorder_point::text as reorder_point
      from stock_balances sb
      join product_variants pv on pv.id = sb.variant_id
      join products p on p.id = pv.product_id
       where sb.organization_id = ${context.organizationId}
         ${context.branchId ? sql`and exists (select 1 from warehouses w where w.id = sb.warehouse_id and w.branch_id = ${context.branchId})` : sql``}
         and sb.available <= sb.reorder_point
      order by sb.available asc limit 10
    `),
    db.execute(sql`
       select so.id, so.order_number, so.total_amount::text as total_amount, so.status,
              so.occurred_at, coalesce(c.name, 'Pelanggan umum') as customer_name,
              coalesce(string_agg(distinct sp.method, ', '), '') as payment_methods,
              coalesce(string_agg(distinct soi.item_name, ', '), 'Transaksi tanpa item') as product_names
       from sales_orders so
       left join customers c on c.id = so.customer_id
       left join sales_payments sp on sp.order_id = so.id
       left join sales_order_items soi on soi.order_id = so.id
       where so.organization_id = ${context.organizationId}
         ${context.branchId ? sql`and so.branch_id = ${context.branchId}` : sql``}
       group by so.id, c.name
      order by so.occurred_at desc
      limit 5
    `),
  ]);
  return dataResponse({ summary: summary.rows[0], trend: trend.rows, topProducts: topProducts.rows, lowStock: lowStock.rows, recentSales: recentSales.rows });
});
