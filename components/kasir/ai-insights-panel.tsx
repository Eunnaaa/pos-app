"use client"

import { useCallback, useEffect, useState } from "react"
import { formatDistanceToNow } from "date-fns"
import { id as idLocale } from "date-fns/locale"
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Clock,
  Loader2,
  Package,
  RefreshCw,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(".", ",")}M`
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
    } catch {
      showError("Gagal memuat AI insights")
    } finally {
      setLoading(false)
    }
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
      showSuccess("Analisis AI berhasil diperbarui")
      await load()
    } catch {
      showError("Gagal membuat AI insights")
    } finally {
      setGenerating(false)
    }
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
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      {/* Header Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div className="flex items-center gap-3.5">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200/80 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-900/60 shadow-2xs">
            <BrainCircuit className="size-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              AI Business Intelligence
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-900">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Analysis
              </span>
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">Analisis proyeksi omset, rekomendasi stok, dan profil pelanggan.</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {latestUpdate && (
            <span className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full border">
              <Clock className="size-3.5 text-muted-foreground/70" />
              {formatDistanceToNow(new Date(latestUpdate), { addSuffix: true, locale: idLocale })}
            </span>
          )}
          <Button
            onClick={() => void generate()}
            disabled={generating}
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-xs gap-2 h-9 px-4 rounded-xl"
          >
            {generating ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Menganalisis...
              </>
            ) : (
              <>
                <Sparkles className="size-4" /> Generate Insights
              </>
            )}
          </Button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      {!loading && insights.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            icon={TrendingUp}
            label="Estimasi Omset (30 Hari)"
            value={forecast ? rupiahShort(forecast.days30 ?? 0) : "—"}
            color="emerald"
            subtext="Proyeksi 30 hari ke depan"
          />
          <KpiCard
            icon={ShoppingCart}
            label="Stok Perlu Restock"
            value={stock ? String(stock.totalLowStock ?? 0) : "—"}
            color={stock && stock.totalLowStock ? "amber" : "emerald"}
            suffix="produk"
            subtext={stock && stock.totalLowStock ? "Perlu order ulang" : "Stok terkendali"}
          />
          <KpiCard
            icon={Users}
            label="Pelanggan Terdaftar"
            value={String(totalCustomers)}
            color="blue"
            suffix="orang"
            subtext="Profil pelanggan aktif"
          />
          <KpiCard
            icon={ShieldCheck}
            label="Deteksi Anomali"
            value={fraud ? String(fraud.totalAlerts ?? 0) : "—"}
            color={fraud && fraud.totalAlerts ? "red" : "emerald"}
            suffix="kejadian"
            subtext={fraud && fraud.totalAlerts ? "Transaksi mencurigakan" : "7 hari terakhir aman"}
          />
        </div>
      )}

      {/* Main Content Area */}
      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : insights.length === 0 ? (
        <EmptyState onGenerate={() => void generate()} generating={generating} />
      ) : generating ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Forecast Card */}
          <ForecastCard insight={byType("forecast")} />

          {/* 2 Column Layout for Restock & Affinity */}
          <div className="grid gap-6 lg:grid-cols-2">
            <StockPlanningCard insight={byType("stock_recommendation")} />
            <ProductAffinityCard insight={byType("product_affinity")} />
          </div>

          {/* 2 Column Layout for Segments & Fraud */}
          <div className="grid gap-6 lg:grid-cols-2">
            <CustomerSegmentCard insight={byType("customer_segment")} />
            <FraudAlertCard insight={byType("fraud_alert")} />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Elegant KPI Card ───
function KpiCard({
  icon: Icon,
  label,
  value,
  color,
  suffix,
  subtext,
}: {
  icon: typeof TrendingUp
  label: string
  value: string
  color: "emerald" | "amber" | "red" | "blue"
  suffix?: string
  subtext?: string
}) {
  const accentBorders = {
    emerald: "border-t-emerald-500",
    amber: "border-t-amber-500",
    red: "border-t-rose-500",
    blue: "border-t-blue-500",
  }

  const iconColors = {
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-900/60",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400 border-amber-200/60 dark:border-amber-900/60",
    red: "bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400 border-rose-200/60 dark:border-rose-900/60",
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400 border-blue-200/60 dark:border-blue-900/60",
  }

  return (
    <Card className={`group relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md bg-card border border-t-2 shadow-2xs rounded-2xl ${accentBorders[color]}`}>
      <CardContent className="p-5 flex flex-col justify-between space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-foreground/80">{label}</span>
          <div className={`flex size-9 shrink-0 items-center justify-center rounded-xl border shadow-2xs ${iconColors[color]}`}>
            <Icon className="size-4.5" />
          </div>
        </div>
        <div>
          <div className="flex items-baseline gap-1.5">
            <p className="text-2xl font-extrabold tracking-tight text-foreground">{value}</p>
            {suffix && <span className="text-xs font-medium text-muted-foreground">{suffix}</span>}
          </div>
          {subtext && <p className="text-[11px] text-muted-foreground/80 font-normal mt-1">{subtext}</p>}
        </div>
      </CardContent>
    </Card>
  )
}


// ─── Skeleton Card Loading ───
function SkeletonCard() {
  return (
    <Card className="shadow-2xs">
      <CardHeader className="pb-3">
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </CardContent>
    </Card>
  )
}

// ─── Empty State ───
function EmptyState({ onGenerate, generating }: { onGenerate: () => void; generating: boolean }) {
  return (
    <Card className="border-dashed shadow-2xs">
      <CardContent className="flex min-h-[260px] flex-col items-center justify-center gap-3 text-center p-6">
        <BrainCircuit className="size-10 text-muted-foreground/40" />
        <div>
          <h3 className="font-bold text-foreground text-base">Belum ada data AI Insights</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            Klik tombol di bawah untuk membuat analisis proyeksi penjualan dan rekomendasi bisnis.
          </p>
        </div>
        <Button onClick={onGenerate} disabled={generating} size="sm" className="bg-emerald-600 hover:bg-emerald-700 mt-2">
          {generating ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4 mr-2" />}
          Generate Insights
        </Button>
      </CardContent>
    </Card>
  )
}

// ─── Confidence Badge ───
function ConfidenceBadge({ value }: { value: number | null }) {
  if (value === null) return null
  return (
    <span className="text-[11px] text-muted-foreground font-medium bg-muted px-2 py-0.5 rounded-full border">
      Akurasi AI: <strong className="text-foreground">{value}%</strong>
    </span>
  )
}

// ─── Forecast Card ───
function ForecastCard({ insight }: { insight?: Insight }) {
  if (!insight) return null
  const p = insight.payload as {
    avgDailySales?: number
    trend?: string
    slope?: number
    days30?: number
    days90?: number
    days365?: number
    error?: string
  }
  if (p.error) return null

  const trendUp = p.trend === "up"
  const trendDown = p.trend === "down"
  const TrendIcon = trendUp ? TrendingUp : trendDown ? TrendingDown : null

  return (
    <Card className="rounded-2xl border shadow-2xs bg-card">
      <CardHeader className="border-b pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-bold text-foreground">
            <TrendingUp className="size-4.5 text-emerald-600" /> Forecast Penjualan
          </CardTitle>
          {insight.confidence !== null && <ConfidenceBadge value={insight.confidence} />}
        </div>
        <CardDescription className="text-xs">Proyeksi omset berbasis regresi linier 30 hari terakhir</CardDescription>
      </CardHeader>

      <CardContent className="p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-muted/40 p-4 border border-border/60">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Rata-rata Penjualan Harian</p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{rupiah(p.avgDailySales ?? 0)}</p>
          </div>
          {TrendIcon && (
            <div className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border bg-background shadow-2xs">
              <TrendIcon className={`size-4 ${trendUp ? "text-emerald-600" : "text-rose-600"}`} />
              <span>{trendUp ? "Tren Naik" : trendDown ? "Tren Turun" : "Stabil"}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <div className="rounded-xl border p-4 bg-card/60 shadow-2xs">
            <p className="text-xs font-medium text-muted-foreground">Proyeksi 30 Hari</p>
            <p className="text-xl font-bold text-foreground mt-1">{rupiah(p.days30 ?? 0)}</p>
          </div>
          <div className="rounded-xl border p-4 bg-card/60 shadow-2xs">
            <p className="text-xs font-medium text-muted-foreground">Proyeksi 90 Hari</p>
            <p className="text-xl font-bold text-foreground mt-1">{rupiah(p.days90 ?? 0)}</p>
          </div>
          <div className="rounded-xl border p-4 bg-card/60 shadow-2xs">
            <p className="text-xs font-medium text-muted-foreground">Proyeksi 1 Tahun</p>
            <p className="text-xl font-bold text-foreground mt-1">{rupiah(p.days365 ?? 0)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Stock Planning Card ───
function StockPlanningCard({ insight }: { insight?: Insight }) {
  if (!insight) return null
  const p = insight.payload as {
    items?: Array<{
      product_name: string
      variant_name: string
      available: string
      daysUntilOut: number | null
      recommendedQty: number
      dailyVelocity: number
    }>
    totalLowStock?: number
    error?: string
  }
  if (p.error) return null
  const items = p.items ?? []

  return (
    <Card className="rounded-2xl border shadow-2xs bg-card">
      <CardHeader className="border-b pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-bold text-foreground">
            <ShoppingCart className="size-4.5 text-emerald-600" /> Rekomendasi Restock
          </CardTitle>
          <Badge variant="outline" className="text-xs font-medium rounded-lg">
            {items.length} Perlu Restock
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-5 space-y-3">
        {items.length > 0 ? (
          items.slice(0, 5).map((item, i) => (
            <div key={i} className="flex items-center justify-between rounded-xl border p-3.5 bg-card/60 text-xs shadow-2xs">
              <div className="min-w-0 flex-1">
                <p className="font-bold text-foreground truncate text-sm">{item.product_name}</p>
                <p className="text-muted-foreground text-[11px] truncate mt-0.5">{item.variant_name} • Sisa: {item.available}</p>
              </div>
              <div className="text-right shrink-0">
                <Badge variant={item.daysUntilOut !== null && item.daysUntilOut <= 3 ? "destructive" : "outline"} className="text-[10px] rounded-md">
                  {item.daysUntilOut === 0 ? "Habis" : `${item.daysUntilOut} hr lagi`}
                </Badge>
                <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 mt-1">Beli +{item.recommendedQty}</p>
              </div>
            </div>
          ))
        ) : (
          <p className="text-xs text-muted-foreground text-center py-6">Seluruh stok dalam kondisi aman.</p>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Product Affinity Card ───
function ProductAffinityCard({ insight }: { insight?: Insight }) {
  if (!insight) return null
  const p = insight.payload as {
    pairs?: Array<{ product_a: string; product_b: string; co_occurrence: number }>
    error?: string
  }
  if (p.error) return null
  const pairs = p.pairs ?? []

  return (
    <Card className="rounded-2xl border shadow-2xs bg-card">
      <CardHeader className="border-b pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-bold text-foreground">
            <Package className="size-4.5 text-emerald-600" /> Afinitas Produk
          </CardTitle>
          <Badge variant="outline" className="text-xs font-medium rounded-lg">Bundling</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-5 space-y-3">
        {pairs.length > 0 ? (
          pairs.slice(0, 5).map((pair, i) => (
            <div key={i} className="flex items-center justify-between rounded-xl border p-3.5 bg-card/60 text-xs shadow-2xs">
              <div className="min-w-0 flex-1 flex items-center gap-1.5 truncate">
                <span className="font-semibold text-foreground truncate text-sm">{pair.product_a}</span>
                <span className="text-muted-foreground font-bold">+</span>
                <span className="font-semibold text-foreground truncate text-sm">{pair.product_b}</span>
              </div>
              <Badge variant="secondary" className="text-[10px] shrink-0 font-bold rounded-md">
                {pair.co_occurrence}x dibeli bersama
              </Badge>
            </div>
          ))
        ) : (
          <p className="text-xs text-muted-foreground text-center py-6">Belum ada cukup data transaksi bundling.</p>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Customer Segment Card ───
function CustomerSegmentCard({ insight }: { insight?: Insight }) {
  if (!insight) return null
  const p = insight.payload as {
    segments?: Array<{ segment: string; count: number; total_spend: string }>
    error?: string
  }
  if (p.error) return null
  const segments = p.segments ?? []

  return (
    <Card className="rounded-2xl border shadow-2xs bg-card">
      <CardHeader className="border-b pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-bold text-foreground">
            <Users className="size-4.5 text-emerald-600" /> Segmentasi Pelanggan
          </CardTitle>
          <Badge variant="outline" className="text-xs font-medium rounded-lg">RFM</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-5 space-y-3">
        {segments.length > 0 ? (
          segments.map((seg) => (
            <div key={seg.segment} className="flex items-center justify-between rounded-xl border p-3.5 bg-card/60 text-xs shadow-2xs">
              <div>
                <p className="font-bold text-foreground text-sm">{seg.segment}</p>
                <p className="text-muted-foreground text-[11px] mt-0.5">Total Belanja: {rupiahShort(seg.total_spend)}</p>
              </div>
              <Badge variant="secondary" className="text-[11px] font-bold rounded-md">
                {seg.count} Kontak
              </Badge>
            </div>
          ))
        ) : (
          <p className="text-xs text-muted-foreground text-center py-6">Belum ada data segmen pelanggan.</p>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Fraud Alert Card ───
function FraudAlertCard({ insight }: { insight?: Insight }) {
  if (!insight) return null
  const p = insight.payload as {
    alerts?: Array<{ order_number: string; total_amount: string; cashier_name: string; reason: string }>
    totalAlerts?: number
    error?: string
  }
  if (p.error) return null
  const alerts = p.alerts ?? []

  return (
    <Card className="rounded-2xl border shadow-2xs bg-card">
      <CardHeader className="border-b pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-bold text-foreground">
            <AlertTriangle className="size-4.5 text-emerald-600" /> Deteksi Fraud
          </CardTitle>
          <Badge variant="outline" className="text-xs font-medium rounded-lg">
            {alerts.length === 0 ? "Aman" : `${alerts.length} Alert`}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-5 space-y-3">
        {alerts.length > 0 ? (
          alerts.slice(0, 5).map((alert, i) => (
            <div key={i} className="flex items-center justify-between rounded-xl border p-3.5 bg-card/60 text-xs border-amber-200/80 shadow-2xs">
              <div className="min-w-0 flex-1">
                <p className="font-bold text-foreground truncate text-sm">{alert.order_number}</p>
                <p className="text-muted-foreground text-[11px] truncate mt-0.5">{alert.cashier_name} • {alert.reason}</p>
              </div>
              <span className="font-extrabold text-amber-700 dark:text-amber-400 shrink-0 ml-2 text-sm">{rupiah(alert.total_amount)}</span>
            </div>
          ))
        ) : (
          <div className="flex items-center justify-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 py-6">
            <CheckCircle2 className="size-4" />
            <span className="font-medium">Tidak ditemukan transaksi mencurigakan.</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

