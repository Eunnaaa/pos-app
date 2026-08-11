import { sql } from "drizzle-orm";
import { db } from "@/db";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";

export const GET = apiHandler(async (request) => {
  const context = await requireApiContext(request, "customers:read");
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || "50"), 200);

  const result = await db.execute(sql`
    select
      lt.id,
      lt.type,
      lt.points::text as points,
      lt.description,
      lt.reference_type,
      lt.reference_id,
      lt.created_at,
      c.name as customer_name,
      c.code as customer_code
    from loyalty_transactions lt
    inner join loyalty_accounts la on la.id = lt.loyalty_account_id
    inner join customers c on c.id = la.customer_id
    where lt.organization_id = ${context.organizationId}
    order by lt.created_at desc
    limit ${limit}
  `);

  return dataResponse(result.rows);
});
