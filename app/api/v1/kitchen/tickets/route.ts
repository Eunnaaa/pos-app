import { sql } from "drizzle-orm";
import { db } from "@/db";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";

export const GET = apiHandler(async (request) => {
  const context = await requireApiContext(request, "sales:read");
  const branchFilter = context.branchId ? sql`and kt.branch_id = ${context.branchId}` : sql``;

  const tickets = await db.execute(sql`
    select
      kt.id,
      kt.number,
      kt.status,
      kt.priority,
      kt.assigned_to,
      kt.started_at,
      kt.ready_at,
      kt.served_at,
      kt.created_at,
      so.order_number,
      so.total_amount::text,
      c.name as customer_name,
      coalesce(
        json_agg(
          json_build_object(
            'id', kti.id,
            'item_name', soi.item_name,
            'quantity', soi.quantity::text,
            'status', kti.status,
            'notes', kti.notes
          )
        ) filter (where kti.id is not null),
        '[]'::json
      ) as items
    from kitchen_tickets kt
    inner join sales_orders so on so.id = kt.order_id
    left join customers c on c.id = so.customer_id
    left join kitchen_ticket_items kti on kti.ticket_id = kt.id
    left join sales_order_items soi on soi.id = kti.order_item_id
    where kt.organization_id = ${context.organizationId} ${branchFilter}
      and kt.status in ('queued', 'cooking', 'ready')
    group by kt.id, so.order_number, so.total_amount, c.name
    order by
      case kt.status when 'queued' then 0 when 'cooking' then 1 when 'ready' then 2 end,
      kt.priority desc,
      kt.created_at
  `);

  return dataResponse(tickets.rows);
});
