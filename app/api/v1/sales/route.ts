import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { getOrganizationPlan } from "@/lib/services/subscription";
import { parseSearchParams } from "@/lib/server";

const querySchema = z.object({
  q: z.string().max(100).optional(),
  branchId: z.string().uuid().optional(),
  allBranches: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  page: z.coerce.number().int().min(1).default(1),
});

export const GET = apiHandler(async (request) => {
  const context = await requireApiContext(request, "sales:read");
  const query = parseSearchParams(request.url, querySchema);
  const search = query.q ? `%${query.q}%` : "%";

  const isCashier = context.tenant.role === "cashier";

  let cashierSessionFilter = sql``;
  let targetBranchId: string | null | undefined = null;

  if (isCashier) {
    // Kasir / Karyawan: Hanya bisa melihat transaksi dari shift & branch yang sedang dibuka
    const activeSessionRes = await db.execute<{ id: string; branch_id: string }>(sql`
      select crs.id, cr.branch_id
      from cash_register_sessions crs
      inner join cash_registers cr on cr.id = crs.register_id
      where crs.organization_id = ${context.organizationId}
        and crs.user_id = ${context.session.user.id}
        and crs.status = 'open'
      order by crs.opened_at desc
      limit 1
    `);
    const activeSession = activeSessionRes.rows[0] as { id: string; branch_id: string } | undefined;

    if (!activeSession) {
      // Jika kasir belum membuka shift aktif, kembalikan daftar kosong
      return dataResponse([], {}, { page: query.page, limit: query.limit, shiftActive: false });
    }

    targetBranchId = activeSession.branch_id || context.branchId;
    cashierSessionFilter = sql`and (so.cash_session_id = ${activeSession.id} or (so.cashier_user_id = ${context.session.user.id} and so.branch_id = ${targetBranchId} and so.occurred_at >= (select opened_at from cash_register_sessions where id = ${activeSession.id} limit 1)))`;
  } else {
    // Owner / Admin: Bebas memilih branch mana saja atau melihat semua branch
    targetBranchId = query.allBranches ? null : (query.branchId || context.branchId);
  }

  const branchFilter = targetBranchId ? sql`and so.branch_id = ${targetBranchId}` : sql``;

  const planSummary = await getOrganizationPlan(context.organizationId);
  let historyDateFilter = sql``;
  if (planSummary.plan.limits.historyDays < 3650) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - planSummary.plan.limits.historyDays);
    historyDateFilter = sql`and so.occurred_at >= ${cutoff.toISOString()}`;
  }

  const result = await db.execute(sql`
    select so.id, so.order_number, so.status, so.channel, so.subtotal_amount::text,
           so.discount_amount::text, so.tax_amount::text, so.total_amount::text,
           so.paid_amount::text, so.change_amount::text, so.occurred_at,
           so.branch_id, coalesce(b.name, 'Cabang Utama') as branch_name,
           c.id as customer_id, c.name as customer_name,
           coalesce(string_agg(distinct sp.method, ', '), '') as payment_methods,
           count(distinct soi.id)::int as item_count
    from sales_orders so
    left join branches b on b.id = so.branch_id
    left join customers c on c.id = so.customer_id
    left join sales_order_items soi on soi.order_id = so.id
    left join sales_payments sp on sp.order_id = so.id
    where so.organization_id = ${context.organizationId}
      ${branchFilter}
      ${cashierSessionFilter}
      ${historyDateFilter}
      and (so.order_number ilike ${search} or coalesce(c.name, '') ilike ${search})
    group by so.id, b.id, b.name, c.id, c.name
    order by so.occurred_at desc
    limit ${query.limit + 1} offset ${(query.page - 1) * query.limit}
  `);
  const hasMore = result.rows.length > query.limit;
  const rows = result.rows.slice(0, query.limit);
  const summaryResult = await db.execute(sql`
    select
      count(*) filter (where so.status in ('paid', 'partially_refunded', 'refunded'))::int as successful_orders,
      coalesce(sum(
        case when so.status in ('paid', 'partially_refunded', 'refunded')
          then greatest(so.total_amount - coalesce(rr.refund_amount, 0), 0)
          else 0 end
      ), 0)::text as net_amount,
      count(*) filter (where so.status in ('partially_refunded', 'refunded'))::int as refunded_orders
    from sales_orders so
    left join customers c on c.id = so.customer_id
    left join (
      select sr.order_id, sum(r.amount) as refund_amount
      from refunds r
      join sales_returns sr on sr.id = r.return_id
      where r.status = 'processed'
      group by sr.order_id
    ) rr on rr.order_id = so.id
    where so.organization_id = ${context.organizationId}
      ${branchFilter}
      ${cashierSessionFilter}
      ${historyDateFilter}
      and (so.order_number ilike ${search} or coalesce(c.name, '') ilike ${search})
  `);
  const summary = summaryResult.rows[0] as Record<string, unknown> | undefined;
  return dataResponse(rows, {}, {
    page: query.page,
    limit: query.limit,
    hasMore,
    shiftActive: true,
    summary: {
      successfulOrders: Number(summary?.successful_orders || 0),
      netAmount: String(summary?.net_amount || "0"),
      refundedOrders: Number(summary?.refunded_orders || 0),
    },
  });
});
