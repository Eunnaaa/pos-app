import { sql } from "drizzle-orm";
import { db } from "@/db";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";

export const GET = apiHandler(async (request) => {
  const context = await requireApiContext(request, "employees:manage");
  const result = await db.execute(sql`
    select tm.id as member_id,
           tm.is_active as member_active,
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
           cs.closed_at as shift_closed_at
    from tenant_members tm
    join "user" u on u.id = tm.user_id
    left join lateral (
      select status, opened_at, closed_at
      from cash_register_sessions
      where user_id = u.id
      order by opened_at desc
      limit 1
    ) cs on true
    where tm.organization_id = ${context.organizationId}
      and tm.role = 'cashier'
    order by u.name asc
  `);
  return dataResponse(result.rows);
});