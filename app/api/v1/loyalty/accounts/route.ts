import { sql } from "drizzle-orm";
import { db } from "@/db";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";

export const GET = apiHandler(async (request) => {
  const context = await requireApiContext(request, "customers:read");
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || "50"), 200);

  const [accountsResult, summaryResult] = await Promise.all([
    db.execute(sql`
      select
        la.id,
        la.customer_id,
        c.name as customer_name,
        c.code as customer_code,
        c.phone as customer_phone,
        c.total_spend_amount::text as total_spend,
        ml.name as membership_level,
        la.points_balance::text as points_balance,
        la.lifetime_points::text as lifetime_points,
        la.created_at,
        la.updated_at
      from loyalty_accounts la
      inner join customers c on c.id = la.customer_id
      left join membership_levels ml on ml.id = c.membership_level_id
      where la.organization_id = ${context.organizationId}
      order by la.points_balance desc
      limit ${limit}
    `),
    db.execute(sql`
      select
        count(*)::int as total_members,
        coalesce(sum(points_balance), 0)::text as total_points,
        coalesce(sum(lifetime_points), 0)::text as total_lifetime_points
      from loyalty_accounts
      where organization_id = ${context.organizationId}
    `),
  ]);

  const summary = summaryResult.rows[0] as { total_members: number; total_points: string; total_lifetime_points: string };
  return dataResponse({ accounts: accountsResult.rows, summary });
});
