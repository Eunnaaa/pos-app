import { sql } from "drizzle-orm";
import { db } from "@/db";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";

export const GET = apiHandler(async (request) => {
  const context = await requireApiContext(request, "employees:manage");
  const result = await db.execute(sql`
    select tm.id as member_id,
           tm.is_active as member_active,
           tm.role as member_role,
           u.id as user_id,
           u.name,
           u.email,
           coalesce((
             select string_agg(b.name, ', ' order by b.name)
             from member_branches mb
             join branches b on b.id = mb.branch_id
             where mb.tenant_member_id = tm.id
           ), 'Semua Cabang') as branch_names,
           cs.status as shift_status,
           cs.opened_at as shift_opened_at,
           cs.closed_at as shift_closed_at,
           coalesce(kpi.total_orders, 0)::int as total_orders,
           coalesce(kpi.total_sales, '0') as total_sales,
           coalesce(kpi.total_shifts, 0)::int as total_shifts,
           coalesce(kpi.total_variance, '0') as total_variance,
           coalesce(kpi.avg_order_value, '0') as avg_order_value,
           coalesce(kpi.perfect_shifts, 0)::int as perfect_shifts
    from tenant_members tm
    join "user" u on u.id = tm.user_id
    left join lateral (
      select status, opened_at, closed_at
      from cash_register_sessions
      where user_id = u.id and organization_id = tm.organization_id
      order by opened_at desc
      limit 1
    ) cs on true
    left join lateral (
      select
        count(so.id)::int as total_orders,
        coalesce(sum(so.total_amount), 0)::text as total_sales,
        (
          select count(*)::int
          from cash_register_sessions crs
          where crs.user_id = u.id and crs.organization_id = tm.organization_id
        ) as total_shifts,
        coalesce((
          select sum(crs.variance_amount)
          from cash_register_sessions crs
          where crs.user_id = u.id and crs.organization_id = tm.organization_id
        ), 0)::text as total_variance,
        case
          when count(so.id) > 0 then (coalesce(sum(so.total_amount), 0) / count(so.id))::text
          else '0'
        end as avg_order_value,
        coalesce((
          select count(*)::int
          from cash_register_sessions crs
          where crs.user_id = u.id and crs.organization_id = tm.organization_id
            and crs.status = 'closed' and coalesce(crs.variance_amount, 0) = 0
        ), 0)::int as perfect_shifts
      from sales_orders so
      where so.organization_id = tm.organization_id
        and (so.cashier_user_id = u.id or so.cash_session_id in (
          select crs2.id from cash_register_sessions crs2 where crs2.user_id = u.id and crs2.organization_id = tm.organization_id
        ))
        and so.status in ('paid', 'partially_refunded', 'refunded')
    ) kpi on true
    where tm.organization_id = ${context.organizationId}
    order by kpi.total_orders desc, u.name asc
  `);
  return dataResponse(result.rows);
});