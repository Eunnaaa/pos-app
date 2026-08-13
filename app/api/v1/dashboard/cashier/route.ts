import { sql } from "drizzle-orm";
import { db } from "@/db";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";

export const GET = apiHandler(async (request) => {
  const context = await requireApiContext(request, "dashboard:read");
  const branchFilter = context.branchId ? sql`and branch_id = ${context.branchId}` : sql``;
  const warehouseBranchFilter = context.branchId
    ? sql`and exists (select 1 from warehouses w where w.id = sb.warehouse_id and w.branch_id = ${context.branchId})`
    : sql``;

  // Phase 1: independent queries (all run in parallel)
  const [summary, recentSales, activeSession, heldOrders, pendingOrders, topProducts, lowStock] = await Promise.all([
    // Today's summary for this cashier (extended with items sold + avg transaction)
    db.execute(sql`
      select
        coalesce(sum(total_amount), 0)::text as sales,
        count(*)::int as orders,
        count(distinct customer_id)::int as customers,
        coalesce(sum(cost_amount), 0)::text as cost,
        case when count(*) > 0 then (sum(total_amount) / count(*))::text else '0' end as avg_transaction
      from sales_orders
      where organization_id = ${context.organizationId} ${branchFilter}
        and cashier_user_id = ${context.session.user.id}
        and status in ('paid', 'partially_refunded', 'refunded')
        and occurred_at >= date_trunc('day', now())
    `),
    // Recent 10 transactions
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
    // Active cash session for this cashier
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
    // Held orders count for this cashier/branch
    db.execute(sql`
      select count(*)::int as count
      from held_orders
      where organization_id = ${context.organizationId} ${branchFilter}
        and created_by = ${context.session.user.id}
        and status = 'held'
        and expires_at > now()
    `),
    // Pending online payment orders (status 'pending', payments 'authorized')
    db.execute(sql`
      select count(*)::int as count
      from sales_orders so
      inner join sales_payments sp on sp.order_id = so.id
      where so.organization_id = ${context.organizationId} ${branchFilter}
        and so.cashier_user_id = ${context.session.user.id}
        and so.status = 'pending'
        and sp.status = 'authorized'
    `),
    // Top 5 products today for this cashier
    db.execute(sql`
      select soi.item_name as name, sum(soi.quantity)::text as quantity, sum(soi.total_amount)::text as sales
      from sales_order_items soi
      join sales_orders so on so.id = soi.order_id
      where soi.organization_id = ${context.organizationId} ${branchFilter}
        and so.cashier_user_id = ${context.session.user.id}
        and so.status in ('paid', 'partially_refunded', 'refunded')
        and so.occurred_at >= date_trunc('day', now())
      group by soi.item_name
      order by sum(soi.quantity) desc
      limit 5
    `),
    // Low stock alerts for this branch
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

  // Phase 2: if there's an active session, compute live expected cash + payment breakdown
  let shift: Record<string, unknown> | null = null;
  const sessionRow = activeSession.rows[0] as Record<string, unknown> | undefined;

  if (sessionRow) {
    const sessionId = sessionRow.id as string;
    const [paymentBreakdown, changeTotal, movementTotals, itemsSold] = await Promise.all([
      // Payments by method for this session
      db.execute(sql`
        select sp.method, coalesce(sum(sp.amount), 0)::text as amount
        from sales_payments sp
        inner join sales_orders so on so.id = sp.order_id
        where so.cash_session_id = ${sessionId}
          and sp.status in ('settled', 'authorized')
        group by sp.method
      `),
      // Total change given
      db.execute(sql`
        select coalesce(sum(change_amount), 0)::text as amount
        from sales_orders
        where cash_session_id = ${sessionId}
      `),
      // Cash movements in/out
      db.execute(sql`
        select direction, coalesce(sum(amount), 0)::text as amount
        from cash_movements
        where session_id = ${sessionId}
        group by direction
      `),
      // Items sold in this session
      db.execute(sql`
        select coalesce(sum(soi.quantity), 0)::text as items
        from sales_order_items soi
        inner join sales_orders so on so.id = soi.order_id
        where so.cash_session_id = ${sessionId}
          and so.status in ('paid', 'partially_refunded', 'refunded')
      `),
    ]);

    const payments: Record<string, string> = Object.fromEntries(paymentBreakdown.rows.map((row) => {
      const r = row as Record<string, string>;
      return [r.method, r.amount];
    }));
    const cashPayments = BigInt(payments.cash ?? "0");
    const cashChange = BigInt((changeTotal.rows[0] as Record<string, string>)?.amount ?? "0");
    const cashIn = BigInt((movementTotals.rows.find((r) => (r as Record<string, string>).direction === "in") as Record<string, string> | undefined)?.amount ?? "0");
    const cashOut = BigInt((movementTotals.rows.find((r) => (r as Record<string, string>).direction === "out") as Record<string, string> | undefined)?.amount ?? "0");
    const opening = BigInt(sessionRow.opening_amount as string);
    const expectedCash = opening + cashPayments - cashChange + cashIn - cashOut;

    shift = {
      ...sessionRow,
      expected_cash: expectedCash.toString(),
      cash_in: cashIn.toString(),
      cash_out: cashOut.toString(),
      cash_change: cashChange.toString(),
      payments,
      items_sold: ((itemsSold.rows[0] as Record<string, string>)?.items ?? "0"),
    };
  }

  return dataResponse({
    summary: summary.rows[0],
    recentSales: recentSales.rows,
    shift,
    heldOrders: (heldOrders.rows[0] as Record<string, unknown>)?.count ?? 0,
    pendingPayments: (pendingOrders.rows[0] as Record<string, unknown>)?.count ?? 0,
    topProducts: topProducts.rows,
    lowStock: lowStock.rows,
  });
});
