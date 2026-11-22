import { getCashSessionAmounts } from "@/lib/services/cash-sessions";
import { calculateSettlement } from "@/lib/services/cash-settlement";
import { joinProcessedRefunds, joinReturnedItems, netOrderTotal } from "@/lib/services/sales-metrics";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { cacheGet, cacheSet, RedisKeys } from "@/lib/redis";

export const GET = apiHandler(async (request) => {
  const context = await requireApiContext(request, "dashboard:read");
  const url = new URL(request.url);
  const bypassCache = url.searchParams.get("fresh") === "true";

  const cacheKey = RedisKeys.cashierDashboard(context.organizationId, context.branchId, context.session.user.id);

  if (!bypassCache) {
    const cached = await cacheGet<Record<string, unknown>>(cacheKey);
    if (cached) {
      return dataResponse(cached);
    }
  }

  const branchFilter = context.branchId ? sql`and branch_id = ${context.branchId}` : sql``;
  const warehouseBranchFilter = context.branchId
    ? sql`and exists (select 1 from warehouses w where w.id = sb.warehouse_id and w.branch_id = ${context.branchId})`
    : sql``;

  const [summary, recentSales, activeSession, heldOrders, pendingOrders, topProducts, lowStock] = await Promise.all([
    db.execute(sql`
      select
        coalesce(sum(${netOrderTotal}), 0)::text as sales,
        count(*)::int as orders,
        count(distinct customer_id)::int as customers,
        coalesce(sum(cost_amount), 0)::text as cost,
        coalesce(avg(${netOrderTotal}), 0)::text as avg_transaction
      from sales_orders so
      ${joinProcessedRefunds(context.organizationId)}
      where so.organization_id = ${context.organizationId} ${context.branchId ? sql`and so.branch_id = ${context.branchId}` : sql``}
        and cashier_user_id = ${context.session.user.id}
        and status in ('paid', 'partially_refunded', 'refunded')
        and occurred_at >= date_trunc('day', now())
    `),
    db.execute(sql`
      select so.id, so.order_number, so.total_amount::text as total_amount, so.status,
             coalesce(c.name, 'Pelanggan umum') as customer_name,
             coalesce(string_agg(distinct sp.method, ', '), '') as payment_methods,
             coalesce(string_agg(distinct soi.item_name, ', '), 'Transaksi tanpa item') as product_names
      from sales_orders so
      left join customers c on c.id = so.customer_id
      left join sales_payments sp on sp.order_id = so.id
      left join sales_order_items soi on soi.order_id = so.id
      where so.organization_id = ${context.organizationId} ${branchFilter}
        and so.cashier_user_id = ${context.session.user.id}
      group by so.id, c.name
      order by so.occurred_at desc
      limit 10
    `),

    db.execute(sql`
      select crs.id, crs.opening_amount::text as opening_amount, crs.opened_at,
             crs.shift_hours, cr.name as register_name, cr.code as register_code,
             cr.branch_id,
             extract(epoch from now() - crs.opened_at)::int as elapsed_seconds
      from cash_register_sessions crs
      inner join cash_registers cr on cr.id = crs.register_id
      where crs.organization_id = ${context.organizationId}
        and crs.user_id = ${context.session.user.id}
        and crs.status = 'open'
        ${context.branchId ? sql`and cr.branch_id = ${context.branchId}` : sql``}
      order by crs.opened_at desc
      limit 1
    `),

    db.execute(sql`
      select count(*)::int as count
      from held_orders
      where organization_id = ${context.organizationId} ${branchFilter}
        and created_by = ${context.session.user.id}
        and status = 'held'
        and expires_at > now()
    `),

    db.execute(sql`
      select count(*)::int as count
      from sales_orders so
      inner join sales_payments sp on sp.order_id = so.id
      where so.organization_id = ${context.organizationId} ${branchFilter}
        and so.cashier_user_id = ${context.session.user.id}
        and so.status = 'pending'
        and sp.status = 'authorized'
    `),

    db.execute(sql`
      select soi.item_name as name, sum(soi.quantity - coalesce(ri.returned_quantity, 0))::text as quantity,
        sum(soi.total_amount - coalesce(ri.refund_amount, 0))::text as sales
      from sales_order_items soi
      join sales_orders so on so.id = soi.order_id
      ${joinReturnedItems(context.organizationId)}
      where soi.organization_id = ${context.organizationId} ${context.branchId ? sql`and so.branch_id = ${context.branchId}` : sql``}
        and so.cashier_user_id = ${context.session.user.id}
        and so.status in ('paid', 'partially_refunded', 'refunded')
        and so.occurred_at >= date_trunc('day', now())
      group by soi.item_name
      having sum(soi.quantity - coalesce(ri.returned_quantity, 0)) > 0
      order by sum(soi.quantity - coalesce(ri.returned_quantity, 0)) desc
      limit 5
    `),

    db.execute(sql`
      select p.name, pv.name as variant, sb.available::text as available, sb.reorder_point::text as reorder_point
      from stock_balances sb
      join product_variants pv on pv.id = sb.variant_id
      join products p on p.id = pv.product_id
      where sb.organization_id = ${context.organizationId} ${warehouseBranchFilter}
        and sb.available <= sb.reorder_point
      order by sb.available asc
      limit 5
    `),
  ]);


  let shift: Record<string, unknown> | null = null;
  const sessionRow = activeSession.rows[0] as Record<string, unknown> | undefined;

  if (sessionRow) {
    const sessionId = sessionRow.id as string;
    const [amounts, itemsSold] = await Promise.all([
      getCashSessionAmounts(sessionId),
      db.execute(sql`
        select coalesce(sum(soi.quantity - coalesce(ri.returned_quantity, 0)), 0)::text as items
        from sales_order_items soi
        inner join sales_orders so on so.id = soi.order_id
        ${joinReturnedItems(context.organizationId)}
        where so.cash_session_id = ${sessionId}
          and so.status in ('paid', 'partially_refunded', 'refunded')
      `),
    ]);

    const { expectedCash } = calculateSettlement({
      ...amounts, openingAmount: BigInt(sessionRow.opening_amount as string), actuals: {},
    });
    shift = {
      ...sessionRow,
      expected_cash: expectedCash.toString(),
      cash_in: amounts.cashIn.toString(),
      cash_out: amounts.cashOut.toString(),
      cash_change: amounts.cashChange.toString(),
      payments: Object.fromEntries(Object.entries(amounts.payments).map(([method, amount]) => [method, amount.toString()])),
      items_sold: ((itemsSold.rows[0] as Record<string, string>)?.items ?? "0"),
    };
  }

  const payload = {
    summary: summary.rows[0],
    recentSales: recentSales.rows,
    shift,
    heldOrders: (heldOrders.rows[0] as Record<string, unknown>)?.count ?? 0,
    pendingPayments: (pendingOrders.rows[0] as Record<string, unknown>)?.count ?? 0,
    topProducts: topProducts.rows,
    lowStock: lowStock.rows,
  };

  void cacheSet(cacheKey, payload, 30);

  return dataResponse(payload);
});
