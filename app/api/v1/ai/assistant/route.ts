import { z } from "zod";
import { getServerEnv } from "@/config/env";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { askAi } from "@/lib/integrations";
import { salesReport } from "@/lib/services/reporting";
import { parseJson } from "@/lib/server";

const schema = z.object({
  question: z.string().trim().min(3).max(2_000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4_000) })).max(10).default([]),
});

type Period = { label: string; start: "day" | "week" | "month" | "year" };

function periodDates(period: Period) {
  const end = new Date();
  const start = new Date(end);
  if (period.start === "year") start.setMonth(0, 1);
  if (period.start === "month") start.setDate(1);
  if (period.start === "week") start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  if (period.start === "day") start.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

function periodFor(question: string): Period {
  const normalized = question.toLowerCase();
  if (/tahun ini|tahun berjalan|year/.test(normalized)) return { label: "tahun ini", start: "year" };
  if (/bulan ini|bulan berjalan|month/.test(normalized)) return { label: "bulan ini", start: "month" };
  if (/hari ini|hari berjalan|today/.test(normalized)) return { label: "hari ini", start: "day" };
  return { label: "minggu ini", start: "week" };
}

export const POST = apiHandler(async (request) => {
  const context = await requireApiContext(request, "reports:read");
  const input = await parseJson(request, schema);
  const period = periodFor(input.question);
  const dates = periodDates(period);
  const report = await salesReport(context.organizationId, context.branchId ?? null, dates.start, dates.end);
  const metrics = {
    period: period.label,
    summary: report.summary,
    topProducts: report.byProduct.slice(0, 5),
    paymentMethods: report.byPaymentMethod,
    topCustomers: report.byCustomer.slice(0, 5),
    salesTrend: report.hourly,
  };
  const env = getServerEnv();
  if (!env.AI_API_KEY || !env.AI_BASE_URL) {
    return dataResponse({
      answer: `${period.label} tercatat ${metrics.summary.totalOrders} order dengan penjualan Rp ${Number(metrics.summary.totalSales).toLocaleString("id-ID")} dan estimasi profit Rp ${Number(metrics.summary.totalProfit).toLocaleString("id-ID")}. ${metrics.topProducts[0] ? `Produk terlaris: ${metrics.topProducts[0].name} (${metrics.topProducts[0].quantity} unit).` : "Belum ada produk terjual pada periode ini."}`,
      source: "deterministic-analytics",
      metrics,
    });
  }
  try {
    const answer = await askAi([
      { role: "system", content: "Anda adalah AI business analyst Kasir-Ku. Jawab Bahasa Indonesia dengan jelas, interaktif, dan praktis. Analisis laporan terstruktur yang diberikan, bukan data mentah. Jangan mengarang angka. Sertakan ringkasan, insight utama, dan rekomendasi jika relevan. Pertanyaan lanjutan harus memakai konteks percakapan dan laporan terbaru." },
      ...input.history,
      { role: "user", content: `Pertanyaan: ${input.question}\nPeriode laporan: ${period.label}\nLaporan penjualan terstruktur: ${JSON.stringify(metrics)}` },
    ]);
    return dataResponse({ answer: answer.content, source: "ai", model: answer.model, metrics });
  } catch {
    return dataResponse({
      answer: `${period.label} tercatat ${metrics.summary.totalOrders} order dengan penjualan Rp ${Number(metrics.summary.totalSales).toLocaleString("id-ID")} dan estimasi profit Rp ${Number(metrics.summary.totalProfit).toLocaleString("id-ID")}. ${metrics.topProducts[0] ? `Produk terlaris: ${metrics.topProducts[0].name} (${metrics.topProducts[0].quantity} unit).` : "Belum ada produk terjual pada periode ini."} AI sedang tidak tersedia; analisis ini dibuat dari laporan penjualan terstruktur.`,
      source: "deterministic-analytics-fallback",
      metrics,
    });
  }
});
