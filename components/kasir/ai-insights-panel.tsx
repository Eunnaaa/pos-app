"use client"

import { useCallback, useEffect, useState } from "react"
import { formatDistanceToNow } from "date-fns"
import { id as idLocale } from "date-fns/locale"
import { AlertTriangle, BrainCircuit, CheckCircle2, Clock, Loader2, Package, RefreshCw, ShoppingCart, TrendingDown, TrendingUp, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { apiFetch } from "@/lib/client"
import { showError, showSuccess } from "@/lib/toast-handler"

type Insight = {
  id: string
  type: "forecast" | "stock_recommendation" | "fraud_alert" | "customer_segment" | "product_affinity"
  payload: Record<string, unknown>
  confidence: number | null
  createdAt: string
}

const rupiah = (v: string | number) => `Rp ${Number(v).toLocaleString("id-ID")}`
const rupiahShort = (v: string | number) => {
  const n = Number(v)
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")}jt`
  if (n >= 1_000) return `${Math.round(n / 1_000)}rb`
  return String(n)
}

export function AiInsightsPanel() {
  const [insights, setInsights] = useState<Insight[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await apiFetch<Insight[]>("/api/v1/ai/insights")
      setInsights(response.data)
    } catch { showError("Gagal memuat insights") }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    void load()
    const handler = () => void load()
    window.addEventListener("kasir-ku-context-change", handler)
    return () => window.removeEventListener("kasir-ku-context-change", handler)
  }, [load])

  async function generate() {
    setGenerating(true)
    try {
      await apiFetch("/api/v1/ai/insights", { method: "POST" })
      showSuccess("AI insights berhasil dibuat")
      await load()
    } catch { showError("Gagal membuat insights") }
    finally { setGenerating(false) }
  }

  const byType = (type: string) => insights.find((i) => i.type === type)
  const latestUpdate = insights.length > 0 ? insights[0].createdAt : null

  // Summary KPIs
  const forecast = byType("forecast")?.payload as { days30?: number; trend?: string; avgDailySales?: number }
  const stock = byType("stock_recommendation")?.payload as { totalLowStock?: number }
  const fraud = byType("fraud_alert")?.payload as { totalAlerts?: number }
  const segments = byType("customer_segment")?.payload as { segments?: Array<{ count: number }> }
  const totalCustomers = segments?.segments?.reduce((sum, s) => sum + s.count, 0) ?? 0

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <BrainCircuit className="size-5" />
          </span>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">AI Insights</h2>
            <p className="text-sm text-muted-foreground">Analisis otomatis dari data bisnis Anda</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {latestUpdate && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="size-3.5" />
              {formatDistanceToNow(new Date(latestUpdate), { addSuffix: true, locale: idLocale })}
            </span>
          )}
          <Button onClick={() => void generate()} disabled={generating} size="sm" className="bg-emerald-600 hover:bg-emerald-700">
            {generating ? <><Loader2 className="size-4 animate-spin" /> Menganalisis...</> : <><RefreshCw className="size-4" /> Generate</>}
          </Button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      {!loading && insights.length > 0 && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <KpiCard icon={TrendingUp} label="Proyeksi 30 hari" value={forecast ? rupiahShort(forecast.days30 ?? 0) : "—"} color="emerald" trend={forecast?.trend} />
          <KpiCard icon={ShoppingCart} label="Perlu restock" value={stock ? String(stock.totalLowStock ?? 0) : "—"} color={stock && stock.totalLowStock ? "amber" : "emerald"} suffix="item" />
          <KpiCard icon={Users} label="Total pelanggan" value={String(totalCustomers)} color="blue" />
          <KpiCard icon={AlertTriangle} label="Fraud alerts" value={fraud ? String(fraud.totalAlerts ?? 0) : "—"} color={fraud && fraud.totalAlerts ? "red" : "emerald"} />
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : insights.length === 0 ? (
        <EmptyState onGenerate={() => void generate()} generating={generating} />
      ) : generating ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Forecast — full width */}
          <ForecastCard insight={byType("forecast")} />

          {/* Stock + Affinity — 2 columns */}
          <div className="grid gap-4 lg:grid-cols-2">
            <StockPlanningCard insight={byType("stock_recommendation")} />
            <ProductAffinityCard insight={byType("product_affinity")} />
          </div>

          {/* Segments + Fraud — 2 columns */}
          <div className="grid gap-4 lg:grid-cols-2">
            <CustomerSegmentCard insight={byType("customer_segment")} />
            <FraudAlertCard insight={byType("fraud_alert")} />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── KPI Card ───
function KpiCard({ icon: Icon, label, value, color, trend, suffix }: { icon: typeof TrendingUp; label: string; value: string; color: "emerald" | "amber" | "red" | "blue"; trend?: string; suffix?: string }) {
  const colors = {
    emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    red: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
    blue: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  }
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${colors[color]}`}>
          <Icon className="size-5" />
          {trend === "up" && <TrendingUp className="ml-1 size-3" />}
          {trend === "down" && <TrendingDown className="ml-1 size-3" />}
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          <p className="truncate text-lg font-bold">{value}{suffix && <span className="ml-1 text-xs font-normal text-muted-foreground">{suffix}</span>}</p>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Skeleton Loading ───
function SkeletonCard() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <div className="grid grid-cols-3 gap-2">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Empty State ───
function EmptyState({ onGenerate, generating }: { onGenerate: () => void; generating: boolean }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex min-h-[280px] flex-col items-center justify-center gap-4 text-center">
        <span className="flex size-16 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-950">
          <BrainCircuit className="size-8 text-emerald-600" />
        </span>
        <div>
          <h3 className="text-lg font-semibold">Mulai analisis bisnis Anda</h3>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">Generate insights untuk mendapatkan forecast penjualan, rekomendasi restock, segmentasi pelanggan, deteksi fraud, dan afinitas produk — semuanya otomatis dari data transaksi Anda.</p>
        </div>
        <Button onClick={onGenerate} disabled={generating} className="bg-emerald-600 hover:bg-emerald-700">
          {generating ? <><Loader2 className="size-4 animate-spin" /> Menganalisis data...</> : <><RefreshCw className="size-4" /> Generate Insights</>}
        </Button>
      </CardContent>
    </Card>
  )
}

// ─── Confidence Badge ───
function ConfidenceBadge({ value }: { value: number | null }) {
  if (value === null) return null
  const color = value >= 80 ? "text-emerald-600" : value >= 50 ? "text-amber-600" : "text-red-600"
  return (
    <div className="flex items-center gap-1.5">
      <Progress value={value} className="h-1.5 w-12" />
      <span className={`text-xs font-medium ${color}`}>{value}%</span>
    </div>
  )
}

// ─── Placeholder for missing insights ───
function PlaceholderCard({ icon: Icon, title, description }: { icon: typeof TrendingUp; title: string; description: string }) {
  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Icon className="size-4 text-muted-foreground" /> {title}</CardTitle></CardHeader>
      <CardContent><p className="py-6 text-center text-sm text-muted-foreground">{description}</p></CardContent>
    </Card>
  )
}

// ─── Error Card ───
function ErrorCard({ title, icon: Icon }: { title: string; icon: typeof TrendingUp }) {
  return (
    <Card className="border-red-200 dark:border-red-900">
      <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Icon className="size-4 text-red-500" /> {title}</CardTitle></CardHeader>
      <CardContent><p className="py-4 text-center text-sm text-muted-foreground">Gagal menganalisis data. Coba generate ulang.</p></CardContent>
    </Card>
  )
}

// ─── Forecast Card (full width) ───
function ForecastCard({ insight }: { insight?: Insight }) {
  if (!insight) return <PlaceholderCard icon={TrendingUp} title="Forecast Penjualan" description="Generate insights untuk melihat proyeksi penjualan." />
  const p = insight.payload as { avgDailySales?: number; trend?: string; slope?: number; days30?: number; days90?: number; days365?: number; confidence?: number; error?: string }
  if (p.error) return <ErrorCard title="Forecast Penjualan" icon={TrendingUp} />

  const trendUp = p.trend === "up"
  const trendDown = p.trend === "down"
  const TrendIcon = trendUp ? TrendingUp : trendDown ? TrendingDown : null
  const trendColor = trendUp ? "text-emerald-600" : trendDown ? "text-red-600" : "text-muted-foreground"
  const trendLabel = trendUp ? "Naik" : trendDown ? "Turun" : "Stabil"
  const projections = [
    { label: "30 hari", value: p.days30 ?? 0, sub: "≈1 bulan" },
    { label: "90 hari", value: p.days90 ?? 0, sub: "≈3 bulan" },
    { label: "365 hari", value: p.days365 ?? 0, sub: "≈1 tahun" },
  ]

  return (
    <Card className="overflow-hidden border-emerald-200 dark:border-emerald-900">
      <div className="bg-gradient-to-r from-emerald-50 to-blue-50 p-5 dark:from-emerald-950/30 dark:to-blue-950/30">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900">
              <TrendingUp className="size-5 text-emerald-600" />
            </span>
            <div>
              <h3 className="text-lg font-bold">Forecast Penjualan</h3>
              <p className="text-sm text-muted-foreground">Proyeksi berbasis regresi linier 30 hari terakhir</p>
            </div>
          </div>
          <div className="text-right">
            {insight.confidence !== null && <ConfidenceBadge value={insight.confidence} />}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Rata-rata penjualan harian</p>
            <p className="text-2xl font-bold text-emerald-600">{rupiah(p.avgDailySales ?? 0)}</p>
          </div>
          {TrendIcon && (
            <div className="flex items-center gap-1.5 rounded-full bg-white/60 px-3 py-1 dark:bg-white/10">
              <TrendIcon className={`size-4 ${trendColor}`} />
              <span className={`text-sm font-semibold ${trendColor}`}>{trendLabel}</span>
              {p.slope !== undefined && <span className="text-xs text-muted-foreground">({p.slope > 0 ? "+" : ""}{p.slope}/hari)</span>}
            </div>
          )}
        </div>
      </div>
      <CardContent className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-3">
        {projections.map((proj) => (
          <div key={proj.label} className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">{proj.label}</p>
              <span className="text-xs text-muted-foreground">{proj.sub}</span>
            </div>
            <p className="mt-2 text-xl font-bold">{rupiah(proj.value)}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

// ─── Stock Planning Card ───
function StockPlanningCard({ insight }: { insight?: Insight }) {
  if (!insight) return <PlaceholderCard icon={ShoppingCart} title="Rekomendasi Restock" description="Generate insights untuk melihat item yang perlu direstock." />
  const p = insight.payload as { items?: Array<{ product_name: string; variant_name: string; available: string; reorder_point: string; daysUntilOut: number | null; recommendedQty: number; dailyVelocity: number; value: string }>; totalLowStock?: number; error?: string }
  if (p.error) return <ErrorCard title="Rekomendasi Restock" icon={ShoppingCart} />

  const items = p.items ?? []
  const critical = items.filter((i) => i.daysUntilOut !== null && i.daysUntilOut <= 3).length
  const warning = items.filter((i) => i.daysUntilOut !== null && i.daysUntilOut > 3 && i.daysUntilOut <= 7).length

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base"><ShoppingCart className="size-4 text-emerald-600" /> Rekomendasi Restock</CardTitle>
          {insight.confidence !== null && <ConfidenceBadge value={insight.confidence} />}
        </div>
        <CardDescription>
          {items.length === 0 ? "Semua stok aman" : `${p.totalLowStock ?? 0} item perlu restock`}
          {critical > 0 && <span className="ml-2 text-red-600">• {critical} kritis</span>}
          {warning > 0 && <span className="ml-2 text-amber-600">• {warning} mendesak</span>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length > 0 ? items.slice(0, 5).map((item, i) => {
          const isCritical = item.daysUntilOut !== null && item.daysUntilOut <= 3
          const isWarning = item.daysUntilOut !== null && item.daysUntilOut > 3 && item.daysUntilOut <= 7
          return (
            <div key={i} className={`rounded-lg border p-3 ${isCritical ? "border-red-300 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20" : isWarning ? "border-amber-300 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.product_name}</p>
                  <p className="text-xs text-muted-foreground">{item.variant_name}</p>
                </div>
                {item.daysUntilOut !== null && (
                  <Badge className={`shrink-0 ${isCritical ? "bg-red-600" : isWarning ? "bg-amber-600" : "bg-muted"}`}>
                    {item.daysUntilOut === 0 ? "Habis" : `${item.daysUntilOut} hari`}
                  </Badge>
                )}
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Tersisa: <span className="font-medium text-foreground">{item.available}</span> • Velocity: {item.dailyVelocity}/hari</span>
                <span className="font-semibold text-emerald-600">Beli {item.recommendedQty} unit</span>
              </div>
            </div>
          )
        }) : (
          <div className="flex items-center gap-2 py-6 text-center">
            <CheckCircle2 className="size-5 text-emerald-600" />
            <p className="text-sm text-muted-foreground">Semua stok di atas reorder point.</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Product Affinity Card ───
function ProductAffinityCard({ insight }: { insight?: Insight }) {
  if (!insight) return <PlaceholderCard icon={Package} title="Afinitas Produk" description="Generate insights untuk melihat produk yang sering dibeli bersama." />
  const p = insight.payload as { pairs?: Array<{ product_a: string; product_b: string; co_occurrence: number; orders: number }>; totalPairs?: number; error?: string }
  if (p.error) return <ErrorCard title="Afinitas Produk" icon={Package} />

  const pairs = p.pairs ?? []
  const maxCo = pairs.length > 0 ? pairs[0].co_occurrence : 1

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base"><Package className="size-4 text-emerald-600" /> Afinitas Produk</CardTitle>
          {insight.confidence !== null && <ConfidenceBadge value={insight.confidence} />}
        </div>
        <CardDescription>Produk yang sering dibeli bersama</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {pairs.length > 0 ? pairs.slice(0, 5).map((pair, i) => (
          <div key={i} className="rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{pair.product_a}</span>
              <span className="shrink-0 text-muted-foreground">+</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{pair.product_b}</span>
              <Badge variant="secondary" className="shrink-0">{pair.co_occurrence}x</Badge>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(pair.co_occurrence / maxCo) * 100}%` }} />
            </div>
          </div>
        )) : (
          <div className="flex items-center gap-2 py-6 text-center">
            <Package className="size-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Belum cukup data transaksi multi-item.</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Customer Segments Card ───
function CustomerSegmentCard({ insight }: { insight?: Insight }) {
  if (!insight) return <PlaceholderCard icon={Users} title="Segmentasi Pelanggan" description="Generate insights untuk segmentasi RFM pelanggan." />
  const p = insight.payload as { segments?: Array<{ segment: string; count: number; total_spend: string; avg_frequency: string; avg_recency_days: number }>; error?: string }
  if (p.error) return <ErrorCard title="Segmentasi Pelanggan" icon={Users} />

  const segments = p.segments ?? []
  const total = segments.reduce((sum, s) => sum + s.count, 0) || 1
  const segStyle: Record<string, { bg: string; bar: string; text: string }> = {
    Champions: { bg: "bg-emerald-100 dark:bg-emerald-950", bar: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-300" },
    Loyal: { bg: "bg-blue-100 dark:bg-blue-950", bar: "bg-blue-500", text: "text-blue-700 dark:text-blue-300" },
    Potential: { bg: "bg-violet-100 dark:bg-violet-950", bar: "bg-violet-500", text: "text-violet-700 dark:text-violet-300" },
    "At Risk": { bg: "bg-amber-100 dark:bg-amber-950", bar: "bg-amber-500", text: "text-amber-700 dark:text-amber-300" },
    Lost: { bg: "bg-red-100 dark:bg-red-950", bar: "bg-red-500", text: "text-red-700 dark:text-red-300" },
    New: { bg: "bg-cyan-100 dark:bg-cyan-950", bar: "bg-cyan-500", text: "text-cyan-700 dark:text-cyan-300" },
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base"><Users className="size-4 text-emerald-600" /> Segmentasi Pelanggan</CardTitle>
          {insight.confidence !== null && <ConfidenceBadge value={insight.confidence} />}
        </div>
        <CardDescription>RFM: Recency, Frequency, Monetary • {total} pelanggan</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {segments.length > 0 ? segments.map((seg) => {
          const style = segStyle[seg.segment] ?? segStyle.New
          const pct = Math.round((seg.count / total) * 100)
          return (
            <div key={seg.segment} className={`rounded-lg p-3 ${style.bg}`}>
              <div className="flex items-center justify-between">
                <span className={`text-sm font-semibold ${style.text}`}>{seg.segment}</span>
                <span className={`text-sm font-bold ${style.text}`}>{seg.count}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/40 dark:bg-black/20">
                <div className={`h-full rounded-full ${style.bar} transition-all`} style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                <span>{rupiahShort(seg.total_spend)}</span>
                <span>avg {seg.avg_frequency}x • {seg.avg_recency_days}h lalu</span>
              </div>
            </div>
          )
        }) : (
          <div className="flex items-center gap-2 py-6 text-center">
            <Users className="size-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Belum ada data pelanggan.</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Fraud Alert Card ───
function FraudAlertCard({ insight }: { insight?: Insight }) {
  if (!insight) return <PlaceholderCard icon={AlertTriangle} title="Fraud Detection" description="Generate insights untuk deteksi transaksi mencurigakan." />
  const p = insight.payload as { alerts?: Array<{ order_number: string; total_amount: string; cashier_name: string; reason: string; occurred_at: string }>; totalAlerts?: number; error?: string }
  if (p.error) return <ErrorCard title="Fraud Detection" icon={AlertTriangle} />

  const alerts = p.alerts ?? []
  const hasAlerts = alerts.length > 0

  return (
    <Card className={hasAlerts ? "border-amber-200 dark:border-amber-900" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className={`size-4 ${hasAlerts ? "text-amber-600" : "text-emerald-600"}`} /> Fraud Detection</CardTitle>
          {insight.confidence !== null && <ConfidenceBadge value={insight.confidence} />}
        </div>
        <CardDescription>{hasAlerts ? `${p.totalAlerts ?? 0} transaksi mencurigakan (7 hari)` : "7 hari terakhir bersih"}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {hasAlerts ? alerts.slice(0, 5).map((alert, i) => (
          <div key={i} className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900 dark:bg-amber-950/20">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{alert.order_number}</p>
              <p className="text-xs text-muted-foreground">{alert.cashier_name} • {alert.reason.replace(/_/g, " ")}</p>
            </div>
            <span className="ml-2 shrink-0 font-semibold text-amber-700 dark:text-amber-400">{rupiah(alert.total_amount)}</span>
          </div>
        )) : (
          <div className="flex items-center gap-2 py-6">
            <CheckCircle2 className="size-5 text-emerald-600" />
            <p className="text-sm text-emerald-600">Tidak ada transaksi mencurigakan.</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
