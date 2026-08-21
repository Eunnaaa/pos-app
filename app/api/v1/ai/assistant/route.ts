import { z } from "zod";
import { getServerEnv } from "@/config/env";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { askAi } from "@/lib/integrations";
import { customerReport, financeReport, inventoryReport, purchaseReport, salesReport } from "@/lib/services/reporting";
import { parseJson } from "@/lib/server";

const schema = z.object({
  question: z.string().trim().min(3).max(2_000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4_000) })).max(10).default([]),
});

type Period = { label: string; start: Date; end: Date };

function periodFor(question: string): Period {
  const normalized = question.toLowerCase();
  const end = new Date();

  if (/kemarin|yesterday/.test(normalized)) {
    const start = new Date(end);
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    return { label: "kemarin", start, end: new Date(start.getTime() + 86_400_000) };
  }

  const daysMatch = normalized.match(/(\d+)\s*(hari|days?)/);
  if (daysMatch && !/ini|berjalan|this/.test(normalized)) {
    const n = parseInt(daysMatch[1], 10);
    const start = new Date(end);
    start.setDate(start.getDate() - n);
    start.setHours(0, 0, 0, 0);
    return { label: `${n} hari terakhir`, start, end };
  }

  if (/hari ini|hari berjalan|today/.test(normalized)) {
    const start = new Date(end);
    start.setHours(0, 0, 0, 0);
    return { label: "hari ini", start, end };
  }

  if (/minggu ini|this week/.test(normalized)) {
    const start = new Date(end);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    start.setHours(0, 0, 0, 0);
    return { label: "minggu ini", start, end };
  }

  if (/minggu lalu|last week/.test(normalized)) {
    const start = new Date(end);
    start.setDate(start.getDate() - 7 - ((start.getDay() + 6) % 7));
    start.setHours(0, 0, 0, 0);
    return { label: "minggu lalu", start, end: new Date(start.getTime() + 7 * 86_400_000) };
  }

  if (/bulan ini|this month/.test(normalized)) {
    const start = new Date(end);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return { label: "bulan ini", start, end };
  }

  if (/bulan lalu|last month/.test(normalized)) {
    const start = new Date(end);
    start.setMonth(start.getMonth() - 1);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return { label: "bulan lalu", start, end: new Date(start.getFullYear(), start.getMonth() + 1, 1) };
  }

  if (/tahun ini|this year/.test(normalized)) {
    const start = new Date(end);
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
    return { label: "tahun ini", start, end };
  }

  const start = new Date(end);
  start.setDate(start.getDate() - 7);
  start.setHours(0, 0, 0, 0);
  return { label: "7 hari terakhir", start, end };
}

const rupiah = (value: string | number) => `Rp ${Number(value).toLocaleString("id-ID")}`;

type Metrics = {
  period: string;
  sales: {
    summary: { totalSales: string; totalProfit: string; totalOrders: number; averageOrderValue: string; uniqueCustomers: number };
    topProducts: Array<{ name: string; quantity: string; sales: string; profit: string }>;
    paymentMethods: Array<{ method: string; amount: string; count: number }>;
  };
  finance: {
    summary: { income: string; expenses: string; profit: string; profitMargin: string; cashBalance: string };
    topIncome: Array<{ category: string; amount: string; percentage: string }>;
    topExpenses: Array<{ category: string; amount: string; percentage: string }>;
  };
  inventory: {
    summary: { totalSKUs: number; totalValue: string; totalQuantity: string; lowStockItems: number; outOfStockItems: number };
    byCategory: Array<{ name: string; quantity: string; value: string; items: number }>;
    movements: Array<{ type: string; quantity: string; value: string; count: number }>;
  };
  customers: {
    summary: { totalCustomers: number; newCustomers: number; activeCustomers: number; totalSpent: string; averageSpent: string };
    bySegment: Array<{ segment: string; count: number; spent: string; frequency: number }>;
    topCustomers: Array<{ name: string; spent: string; orders: number; points: string }>;
  };
  purchases: {
    summary: { totalOrders: number; totalAmount: string; totalReceivedAmount: string; pendingAmount: string; uniqueSuppliers: number };
    bySupplier: Array<{ name: string; orders: number; amount: string; avg_days: number }>;
    byStatus: Array<{ status: string; count: number; amount: string }>;
  };
};

function deterministicAnswer(metrics: Metrics): string {
  const { period, sales, finance, inventory, customers, purchases } = metrics;
  const lines: string[] = [];
  lines.push(`📊 Ringkasan Bisnis — ${period}`);
  lines.push("");
  lines.push("**Penjualan**");
  lines.push(`• Total penjualan: ${rupiah(sales.summary.totalSales)}`);
  lines.push(`• Total profit: ${rupiah(sales.summary.totalProfit)}`);
  lines.push(`• Total transaksi: ${sales.summary.totalOrders}`);
  lines.push(`• Rata-rata nilai order: ${rupiah(sales.summary.averageOrderValue)}`);
  lines.push(`• Pelanggan unik: ${sales.summary.uniqueCustomers}`);
  if (sales.topProducts.length) {
    lines.push("");
    lines.push("**Produk terlaris:**");
    sales.topProducts.forEach((p, i) => lines.push(`${i + 1}. ${p.name} — ${p.quantity} unit, ${rupiah(p.sales)}`));
  }
  if (sales.paymentMethods.length) {
    lines.push("");
    lines.push("**Metode pembayaran:**");
    sales.paymentMethods.forEach((m) => lines.push(`• ${m.method}: ${rupiah(m.amount)} (${m.count} transaksi)`));
  }
  lines.push("");
  lines.push("**Keuangan**");
  lines.push(`• Pendapatan: ${rupiah(finance.summary.income)}`);
  lines.push(`• Pengeluaran: ${rupiah(finance.summary.expenses)}`);
  lines.push(`• Profit: ${rupiah(finance.summary.profit)} (margin ${finance.summary.profitMargin}%)`);
  lines.push(`• Saldo kas: ${rupiah(finance.summary.cashBalance)}`);
  if (finance.topExpenses.length) {
    lines.push("");
    lines.push("**Pengeluaran terbesar:**");
    finance.topExpenses.forEach((e, i) => lines.push(`${i + 1}. ${e.category} — ${rupiah(e.amount)} (${e.percentage}%)`));
  }
  lines.push("");
  lines.push("**Inventory**");
  lines.push(`• Total SKU: ${inventory.summary.totalSKUs}`);
  lines.push(`• Nilai stok: ${rupiah(inventory.summary.totalValue)}`);
  lines.push(`• Stok rendah: ${inventory.summary.lowStockItems} item`);
  lines.push(`• Stok habis: ${inventory.summary.outOfStockItems} item`);
  if (inventory.summary.lowStockItems > 0) lines.push(`⚠ ${inventory.summary.lowStockItems} produk perlu segera di-restock`);
  lines.push("");
  lines.push("**Pelanggan**");
  lines.push(`• Total pelanggan: ${customers.summary.totalCustomers}`);
  lines.push(`• Pelanggan baru: ${customers.summary.newCustomers}`);
  lines.push(`• Pelanggan aktif: ${customers.summary.activeCustomers}`);
  lines.push(`• Rata-rata spend: ${rupiah(customers.summary.averageSpent)}`);
  if (customers.bySegment.length) {
    lines.push("");
    lines.push("**Segmentasi:**");
    customers.bySegment.forEach((s) => lines.push(`• ${s.segment}: ${s.count} pelanggan, ${rupiah(s.spent)}`));
  }
  lines.push("");
  lines.push("**Pembelian**");
  lines.push(`• Total PO: ${purchases.summary.totalOrders}`);
  lines.push(`• Total amount: ${rupiah(purchases.summary.totalAmount)}`);
  lines.push(`• Pending: ${rupiah(purchases.summary.pendingAmount)}`);
  lines.push(`• Supplier: ${purchases.summary.uniqueSuppliers}`);
  lines.push("");
  lines.push("💡 Aktifkan AI provider di pengaturan untuk analisis mendalam, insight, dan tanya-jawab interaktif.");
  return lines.join("\n");
}

const SYSTEM_PROMPT = `Anda adalah AI business analyst untuk Kedai-Ku, platform POS multi-cabang untuk bisnis Indonesia. Jawab dalam Bahasa Indonesia yang jelas, interaktif, dan praktis.

Konteks bisnis:
- Mata uang: IDR (Rupiah), format: Rp X.XXX.XXX
- Bisnis: retail, F&B, atau jasa multi-cabang
- Stok terpisah per cabang/gudang

Data tersedia (periode sesuai pertanyaan user):
- Penjualan: total, profit, order, produk terlaris, metode pembayaran, tren per jam
- Keuangan: pendapatan, pengeluaran, profit, margin, saldo kas, arus kas harian
- Inventory: total SKU, nilai stok, stok rendah/habis, pergerakan stok, rotasi
- Pelanggan: total, baru/aktif, segmentasi, rata-rata spend, pelanggan terbaik
- Pembelian: total PO, amount, pending, supplier, status penerimaan

Aturan:
- Gunakan HANYA data yang diberikan, jangan mengarang angka
- Format rupiah dengan "Rp" dan pemisah ribuan
- Sertakan ringkasan, insight utama, dan rekomendasi praktis
- Untuk pertanyaan di luar data tersedia, akui keterbatasan dan sarankan apa yang bisa dijawab
- Gunakan format markdown sederhana: **bold** untuk section, bullet (•) untuk list
- Pertanyaan lanjutan harus memakai konteks percakapan dan laporan terbaru`;

export const POST = apiHandler(async (request) => {
  const context = await requireApiContext(request, "reports:read");
  const input = await parseJson(request, schema);
  const history = input.history.reduce<typeof input.history>((messages, message) => {
    if (messages.reduce((total, item) => total + item.content.length, 0) + message.content.length <= 12_000) messages.push(message);
    return messages;
  }, []);

  const period = periodFor(input.question);

  const [sales, finance, inventory, customers, purchases] = await Promise.all([
    salesReport(context.organizationId, context.branchId ?? null, period.start, period.end),
    financeReport(context.organizationId, context.branchId ?? null, period.start, period.end),
    inventoryReport(context.organizationId, context.branchId ?? null, period.start, period.end),
    customerReport(context.organizationId, context.branchId ?? null, period.start, period.end),
    purchaseReport(context.organizationId, context.branchId ?? null, period.start, period.end),
  ]);

  const metrics: Metrics = {
    period: period.label,
    sales: {
      summary: sales.summary,
      topProducts: sales.byProduct.slice(0, 5),
      paymentMethods: sales.byPaymentMethod,
    },
    finance: {
      summary: finance.summary,
      topIncome: finance.incomeBreakdown.slice(0, 5),
      topExpenses: finance.expenseBreakdown.slice(0, 5),
    },
    inventory: {
      summary: inventory.summary,
      byCategory: inventory.byCategory.slice(0, 5),
      movements: inventory.movements,
    },
    customers: {
      summary: customers.summary,
      bySegment: customers.bySegment,
      topCustomers: customers.topCustomers.slice(0, 5),
    },
    purchases: {
      summary: purchases.summary,
      bySupplier: purchases.bySupplier.slice(0, 5),
      byStatus: purchases.byStatus,
    },
  };

  const env = getServerEnv();
  if (!env.AI_API_KEY || !env.AI_BASE_URL) {
    return dataResponse({ answer: deterministicAnswer(metrics), source: "deterministic", model: null, metrics });
  }

  try {
    const answer = await askAi([
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
      { role: "user", content: `Pertanyaan: ${input.question}\nPeriode: ${period.label}\nData terstruktur:\n${JSON.stringify(metrics)}` },
    ]);
    return dataResponse({ answer: answer.content, source: "ai", model: answer.model, metrics });
  } catch {
    return dataResponse({ answer: deterministicAnswer(metrics), source: "deterministic-fallback", model: null, metrics });
  }
});
