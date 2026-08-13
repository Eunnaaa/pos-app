import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { analyticsInsights, type JsonValue } from "@/db/schema";
import type { Database } from "@/db";
import { logger } from "@/lib/server/logger";

const rupiah = (value: string | number) => `Rp ${Number(value).toLocaleString("id-ID")}`;

type InsightContext = { organizationId: string; branchId?: string; database?: Database };

// ────────────────────────────────────────────────────────────
// C1: FORECAST — Project future sales using linear regression
// ────────────────────────────────────────────────────────────
export async function generateForecast(ctx: InsightContext) {
  const branchFilter = ctx.branchId ? sql`and branch_id = ${ctx.branchId}` : sql``;
  const rows = await db.execute<{ date: string; sales: string }>(sql`
    select date_trunc('day', occurred_at)::date as date,
           sum(total_amount)::bigint as sales
    from sales_orders
    where organization_id = ${ctx.organizationId} ${branchFilter}
      and status in ('paid','partially_refunded','refunded')
      and occurred_at >= now() - interval '30 days'
    group by date_trunc('day', occurred_at)
    order by date_trunc('day', occurred_at)
  `);

  const data = rows.rows as Array<{ date: string; sales: string }>;
  if (data.length < 3) {
    return { type: "forecast" as const, payload: { error: "Insufficient data (need ≥3 days of sales)", days30: 0, days90: 0, days365: 0 }, confidence: 0 };
  }

  const values = data.map((r) => Number(r.sales));
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const slope = (() => {
    const sumX = (n * (n - 1)) / 2;
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = values.reduce((sum, y, x) => sum + x * y, 0);
    const sumX2 = ((n - 1) * n * (2 * n - 1)) / 6;
    const denom = n * sumX2 - sumX * sumX;
    return denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  })();
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);
  const confidence = stdDev === 0 ? 100 : Math.max(0, Math.round((1 - stdDev / mean) * 100));

  const project = (days: number) => Math.round((mean + slope) * days);
  const payload = {
    avgDailySales: Math.round(mean),
    trend: slope > 0 ? "up" : slope < 0 ? "down" : "flat" as const,
    slope: Math.round(slope),
    days30: project(30),
    days90: project(90),
    days365: project(365),
    confidence,
  };
  return { type: "forecast" as const, payload: payload as unknown as JsonValue, confidence };
}

// ────────────────────────────────────────────────────────────
// C2: PRODUCT AFFINITY — Products frequently bought together
// ────────────────────────────────────────────────────────────
export async function generateProductAffinity(ctx: InsightContext) {
  const branchFilter = ctx.branchId ? sql`and so.branch_id = ${ctx.branchId}` : sql``;
  const rows = await db.execute(sql`
    select soi1.item_name as product_a,
           soi2.item_name as product_b,
           count(*)::int as co_occurrence,
           count(distinct soi1.order_id)::int as orders
    from sales_order_items soi1
    join sales_order_items soi2 on soi1.order_id = soi2.order_id and soi1.id < soi2.id
    join sales_orders so on so.id = soi1.order_id
    where so.organization_id = ${ctx.organizationId} ${branchFilter}
      and so.status in ('paid','partially_refunded','refunded')
      and so.occurred_at >= now() - interval '30 days'
    group by soi1.item_name, soi2.item_name
    order by count(*) desc
    limit 10
  `);

  const pairs = rows.rows as Array<{ product_a: string; product_b: string; co_occurrence: number; orders: number }>;
  return {
    type: "product_affinity" as const,
    payload: { pairs, totalPairs: pairs.length } as unknown as JsonValue,
    confidence: pairs.length > 0 ? Math.min(100, pairs[0].co_occurrence * 10) : 0,
  };
}

// ────────────────────────────────────────────────────────────
// C3: STOCK PLANNING — Items needing reorder
// ────────────────────────────────────────────────────────────
export async function generateStockPlanning(ctx: InsightContext) {
  const branchFilter = ctx.branchId
    ? sql`and exists (select 1 from warehouses w where w.id = sb.warehouse_id and w.branch_id = ${ctx.branchId})`
    : sql``;
  const rows = await db.execute(sql`
    select pv.id as variant_id,
           p.name as product_name,
           pv.name as variant_name,
           sb.available::text as available,
           sb.reorder_point::text as reorder_point,
           sb.average_cost_amount::text as avg_cost,
           coalesce((
             select sum(abs(quantity))::text
             from stock_movements sm
             where sm.variant_id = pv.id and sm.type = 'sale'
               and sm.created_at >= now() - interval '30 days'
           ), '0') as sold_30d
    from stock_balances sb
    join product_variants pv on pv.id = sb.variant_id
    join products p on p.id = pv.product_id
    where sb.organization_id = ${ctx.organizationId} ${branchFilter}
      and sb.available <= sb.reorder_point
    order by sb.available asc
    limit 20
  `);

  const items = rows.rows as Array<{ variant_id: string; product_name: string; variant_name: string; available: string; reorder_point: string; avg_cost: string; sold_30d: string }>;
  const enriched = items.map((item) => {
    const sold30d = Number(item.sold_30d);
    const dailyVelocity = sold30d / 30;
    const available = Number(item.available);
    const daysUntilOut = dailyVelocity > 0 ? Math.floor(available / dailyVelocity) : null;
    const recommendedQty = Math.max(Number(item.reorder_point) * 2 - available, Number(item.reorder_point));
    return { ...item, dailyVelocity: Math.round(dailyVelocity * 10) / 10, daysUntilOut, recommendedQty, value: rupiah(Number(item.avg_cost) * recommendedQty) };
  });

  return {
    type: "stock_recommendation" as const,
    payload: { items: enriched, totalLowStock: enriched.length } as unknown as JsonValue,
    confidence: enriched.length > 0 ? 90 : 0,
  };
}

// ────────────────────────────────────────────────────────────
// C4: FRAUD DETECTION — Flag suspicious transactions
// ────────────────────────────────────────────────────────────
export async function generateFraudAlerts(ctx: InsightContext) {
  const branchFilter = ctx.branchId ? sql`and so.branch_id = ${ctx.branchId}` : sql``;
  const rows = await db.execute(sql`
    with stats as (
      select coalesce(avg(total_amount), 0)::numeric as avg_amount,
             coalesce(stddev(total_amount), 0)::numeric as std_amount
      from sales_orders
      where organization_id = ${ctx.organizationId}
        and status in ('paid','partially_refunded','refunded')
        and occurred_at >= now() - interval '30 days'
    )
    select so.id,
           so.order_number,
           so.total_amount::text,
           so.occurred_at,
           coalesce(u.name, 'Unknown') as cashier_name,
           so.status,
           case
             when so.total_amount > (select avg_amount + 3 * std_amount from stats) then 'high_amount'
             when so.total_amount > (select avg_amount * 5 from stats) then 'extreme_amount'
           end as reason
    from sales_orders so
    left join "user" u on u.id = so.cashier_user_id,
    stats
    where so.organization_id = ${ctx.organizationId} ${branchFilter}
      and so.status in ('paid','partially_refunded','refunded')
      and so.occurred_at >= now() - interval '7 days'
      and so.total_amount > (select avg_amount + 3 * std_amount from stats)
      and (select std_amount from stats) > 0
    order by so.total_amount desc
    limit 10
  `);

  const alerts = rows.rows as Array<{ id: string; order_number: string; total_amount: string; occurred_at: string; cashier_name: string; status: string; reason: string }>;
  return {
    type: "fraud_alert" as const,
    payload: { alerts, totalAlerts: alerts.length } as unknown as JsonValue,
    confidence: alerts.length > 0 ? 70 : 95,
  };
}

// ────────────────────────────────────────────────────────────
// C5: CUSTOMER SEGMENTATION — RFM analysis
// ────────────────────────────────────────────────────────────
export async function generateCustomerSegments(ctx: InsightContext) {
  const branchFilter = ctx.branchId ? sql`and so.branch_id = ${ctx.branchId}` : sql``;
  const rows = await db.execute(sql`
    with rfm as (
      select c.id,
             coalesce(sum(so.total_amount), 0)::bigint as monetary,
             count(distinct so.id)::int as frequency,
             case
               when max(so.occurred_at) is null then 999
               else extract(day from now() - max(so.occurred_at))::int
             end as recency
      from customers c
      left join sales_orders so on so.customer_id = c.id
        and so.organization_id = ${ctx.organizationId}
        and so.status in ('paid','partially_refunded','refunded')
        and so.occurred_at >= now() - interval '90 days'
        ${branchFilter}
      where c.organization_id = ${ctx.organizationId}
      group by c.id
    )
    select
      case
        when recency <= 30 and frequency >= 5 and monetary >= 1000000 then 'Champions'
        when recency <= 60 and frequency >= 3 then 'Loyal'
        when recency <= 30 and frequency < 3 then 'Potential'
        when recency > 60 and frequency >= 3 then 'At Risk'
        when recency > 90 then 'Lost'
        else 'New'
      end as segment,
      count(*)::int as count,
      coalesce(sum(monetary), 0)::text as total_spend,
      coalesce(avg(frequency), 0)::numeric(10,1) as avg_frequency,
      coalesce(avg(recency), 0)::int as avg_recency_days
    from rfm
    group by 1
    order by count desc
  `);

  const segments = rows.rows as Array<{ segment: string; count: number; total_spend: string; avg_frequency: string; avg_recency_days: number }>;
  return {
    type: "customer_segment" as const,
    payload: { segments } as unknown as JsonValue,
    confidence: segments.length > 0 ? 85 : 0,
  };
}

// ────────────────────────────────────────────────────────────
// C6: Store & List Insights
// ────────────────────────────────────────────────────────────
export type InsightType = "forecast" | "stock_recommendation" | "fraud_alert" | "customer_segment" | "product_affinity";

export async function generateAndStoreInsights(ctx: InsightContext) {
  const now = new Date();
  const periodStart = new Date(now.getTime() - 30 * 86_400_000);
  const generators = [
    { fn: generateForecast, type: "forecast" as const },
    { fn: generateProductAffinity, type: "product_affinity" as const },
    { fn: generateStockPlanning, type: "stock_recommendation" as const },
    { fn: generateFraudAlerts, type: "fraud_alert" as const },
    { fn: generateCustomerSegments, type: "customer_segment" as const },
  ];

  const results: Array<{ type: string; payload: JsonValue; confidence: number }> = [];
  for (const { fn, type } of generators) {
    try {
      const result = await fn(ctx);
      results.push({ type, payload: result.payload, confidence: result.confidence });
    } catch (error) {
      logger.error(`AI insight ${type} failed`, { type }, error);
      results.push({ type, payload: { error: "Failed to generate" } as unknown as JsonValue, confidence: 0 });
    }
  }

  // Delete old insights of same scope, then insert fresh ones
  await db.delete(analyticsInsights).where(and(
    eq(analyticsInsights.organizationId, ctx.organizationId),
    ctx.branchId ? eq(analyticsInsights.branchId, ctx.branchId) : sql`${analyticsInsights.branchId} is null`,
  ));
  for (const result of results) {
    await db.insert(analyticsInsights).values({
      organizationId: ctx.organizationId,
      branchId: ctx.branchId,
      type: result.type as InsightType,
      periodStart,
      periodEnd: now,
      model: "deterministic",
      payload: result.payload,
      confidence: result.confidence,
      expiresAt: new Date(now.getTime() + 6 * 3600_000),
    });
  }
  return results;
}

export async function listStoredInsights(ctx: InsightContext) {
  const where = ctx.branchId
    ? and(eq(analyticsInsights.organizationId, ctx.organizationId), eq(analyticsInsights.branchId, ctx.branchId))
    : and(eq(analyticsInsights.organizationId, ctx.organizationId), sql`${analyticsInsights.branchId} is null`);

  return db.select().from(analyticsInsights).where(where).orderBy(sql`${analyticsInsights.createdAt} desc`).limit(50);
}
