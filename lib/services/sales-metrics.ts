import { sql } from "drizzle-orm";

export const netOrderTotal = sql`greatest(so.total_amount - coalesce(rr.refund_amount, 0), 0)`;

export function joinProcessedRefunds(organizationId: string) {
  return sql`
    left join (
      select sr.order_id, sum(r.amount) as refund_amount
      from refunds r
      join sales_returns sr on sr.id = r.return_id
      where sr.organization_id = ${organizationId} and r.status = 'processed'
      group by sr.order_id
    ) rr on rr.order_id = so.id
  `;
}

export function joinReturnedItems(organizationId: string) {
  return sql`
    left join (
      select sri.order_item_id, sum(sri.quantity) as returned_quantity, sum(sri.refund_amount) as refund_amount
      from sales_return_items sri
      join sales_returns sr on sr.id = sri.return_id
      where sr.organization_id = ${organizationId} and sr.status = 'refunded'
      group by sri.order_item_id
    ) ri on ri.order_item_id = soi.id
  `;
}
