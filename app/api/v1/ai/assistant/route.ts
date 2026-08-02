import { sql } from "drizzle-orm";
import { z } from "zod";
import { getServerEnv } from "@/config/env";
import { db } from "@/db";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { askAi } from "@/lib/integrations";
import { parseJson } from "@/lib/server";

const schema = z.object({ question: z.string().min(3).max(2_000) });

export const POST = apiHandler(async (request) => {
  const context = await requireApiContext(request, "reports:read");
  const input = await parseJson(request, schema);
  const summary = await db.execute(sql`
    select coalesce(sum(total_amount), 0)::text as sales,
           coalesce(sum(total_amount - cost_amount), 0)::text as profit,
           count(*)::int as orders
    from sales_orders
    where organization_id = ${context.organizationId}
      and occurred_at >= date_trunc('week', now())
      and status in ('paid', 'partially_refunded', 'refunded')
  `);
  const metrics = summary.rows[0] ?? { sales: "0", profit: "0", orders: 0 };
  const env = getServerEnv();
  if (!env.AI_API_KEY || !env.AI_BASE_URL) {
    return dataResponse({
      answer: `Minggu ini tercatat ${metrics.orders} order dengan penjualan Rp ${Number(metrics.sales).toLocaleString("id-ID")} dan estimasi profit Rp ${Number(metrics.profit).toLocaleString("id-ID")}.`,
      source: "deterministic-analytics",
      metrics,
    });
  }
  const answer = await askAi([
    { role: "system", content: "Anda adalah asisten bisnis Kasir-Ku. Jawab singkat dalam Bahasa Indonesia. Jangan mengarang data. Gunakan hanya metrik yang diberikan." },
    { role: "user", content: `Pertanyaan: ${input.question}\nMetrik minggu ini: ${JSON.stringify(metrics)}` },
  ]);
  return dataResponse({ answer: answer.content, source: "ai", model: answer.model, metrics });
});
