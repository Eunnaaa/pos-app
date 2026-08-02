import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { parseSearchParams } from "@/lib/server";

const querySchema = z.object({ q: z.string().max(100).optional(), limit: z.coerce.number().int().min(1).max(100).default(50), page: z.coerce.number().int().min(1).default(1) });

export const GET = apiHandler(async (request) => {
  const context = await requireApiContext(request, "sales:read");
  const query = parseSearchParams(request.url, querySchema);
  const search = query.q ? `%${query.q}%` : "%";
  const result = await db.execute(sql`
    select so.id, so.order_number, so.status, so.channel, so.subtotal_amount::text,
           so.discount_amount::text, so.tax_amount::text, so.total_amount::text,
           so.paid_amount::text, so.change_amount::text, so.occurred_at,
           c.id as customer_id, c.name as customer_name,
           coalesce(string_agg(distinct sp.method, ', '), '') as payment_methods,
           count(distinct soi.id)::int as item_count
    from sales_orders so
    left join customers c on c.id = so.customer_id
    left join sales_payments sp on sp.order_id = so.id
    left join sales_order_items soi on soi.order_id = so.id
    where so.organization_id = ${context.organizationId}
      and (so.order_number ilike ${search} or coalesce(c.name, '') ilike ${search})
    group by so.id, c.id, c.name
    order by so.occurred_at desc
    limit ${query.limit} offset ${(query.page - 1) * query.limit}
  `);
  return dataResponse(result.rows, {}, { page: query.page, limit: query.limit });
});
