"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSession } from "@/lib/auth-client"
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  BarChart3,
  Loader2,
  PackagePlus,
  ReceiptText,
  ShoppingBag,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { apiFetch } from "@/lib/client"
import { subscribeToTable } from "@/lib/client/realtime"
import { useOrganization } from "@/components/kasir/organization-provider"
import { AnnouncementBanner } from "@/components/announcement-banner"
import { showError } from "@/lib/toast-handler"

interface DashboardData {
  summary: { sales: string; profit: string; orders: number; customers: number }
  trend: { date: string; sales: string; orders: number }[]
  topProducts: { name: string; quantity: string; sales: string }[]
  lowStock: { id: string; name: string; variant: string; available: string; reorder_point: string }[]
  recentSales: { id: string; order_number: string; total_amount: string; status: string; occurred_at: string; customer_name: string; payment_methods: string; product_names: string }[]
}

const emptyData: DashboardData = {
  summary: { sales: "0", profit: "0", orders: 0, customers: 0 },
  trend: [], topProducts: [], lowStock: [], recentSales: [],
}

const rupiah = (value: string | number) => `Rp ${Number(value).toLocaleString("id-ID")}`

export function DashboardOverview() {
  const { data: session } = useSession()
  const { organization } = useOrganization()
  const [dashboard, setDashboard] = useState<DashboardData>(emptyData)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [reloadKey, setReloadKey] = useState(0)

  const [days, setDays] = useState<7 | 14 | 30>(30)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError("")
    try {
      const response = await apiFetch<DashboardData>(`/api/v1/dashboard?days=${days}`)
      setDashboard(response.data)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Gagal mengambil dashboard"
      if (!silent) setError(message)
      showError(message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [days])

  useEffect(() => {
    void load()
    const refresh = () => void load(true)
    window.addEventListener("kedai-ku-context-change", refresh)
    return () => window.removeEventListener("kedai-ku-context-change", refresh)
  }, [load, reloadKey])

  const orgId = organization?.id
  useEffect(() => {
    if (!orgId) return
    const unsubscribe = subscribeToTable("sales_orders", orgId, () => void load(true))
    return unsubscribe
  }, [orgId, load])

  const totalPeriodSales = dashboard.trend.reduce((sum, item) => sum + Number(item.sales || 0), 0)
  const totalPeriodOrders = dashboard.trend.reduce((sum, item) => sum + Number(item.orders || 0), 0)
  const avgDailySales = dashboard.trend.length ? Math.round(totalPeriodSales / dashboard.trend.length) : 0

  const { yTicks, yMax } = useMemo(() => {
    const maxVal = Math.max(...dashboard.trend.map((d) => Number(d.sales || 0)), 0)

    let step = 100_000
    if (maxVal > 20_000_000) {
      step = 5_000_000
    } else if (maxVal > 10_000_000) {
      step = 2_000_000
    } else if (maxVal > 2_000_000) {
      step = 1_000_000
    } else if (maxVal > 500_000) {
      step = 500_000
    } else {
      step = 100_000
    }

    const calculatedMax = Math.max(step, Math.ceil(maxVal / step) * step)
    const ticks: number[] = []
    for (let val = 0; val <= calculatedMax; val += step) {
      ticks.push(val)
    }

    if (ticks.length > 6) {
      const reducedTicks = [0]
      const stride = Math.ceil(ticks.length / 5)
      for (let i = stride; i < ticks.length - 1; i += stride) {
        reducedTicks.push(ticks[i])
      }
      reducedTicks.push(calculatedMax)
      return { yTicks: reducedTicks, yMax: calculatedMax }
    }

    return { yTicks: ticks, yMax: calculatedMax }
  }, [dashboard.trend])

  const kpis = [
    { label: "Penjualan hari ini", value: rupiah(dashboard.summary.sales), note: "Transaksi berstatus selesai", icon: Banknote, color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-950" },
    { label: "Profit hari ini", value: rupiah(dashboard.summary.profit), note: "Penjualan dikurangi HPP", icon: TrendingUp, color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-950" },
    { label: "Total order", value: String(dashboard.summary.orders), note: "Order hari ini", icon: ShoppingBag, color: "text-violet-600", bg: "bg-violet-100 dark:bg-violet-950" },
    { label: "Pelanggan", value: String(dashboard.summary.customers), note: "Pelanggan unik hari ini", icon: Users, color: "text-orange-600", bg: "bg-orange-100 dark:bg-orange-950" },
  ]

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="size-8 animate-spin text-emerald-600" /></div>

  return <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
    <AnnouncementBanner />
    <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-2xl font-bold tracking-tight">Selamat datang, {session?.user.name || "Pengguna"}</h2><p className="text-muted-foreground">Ringkasan bisnis berdasarkan data aktual.</p></div><div className="flex gap-2"><Button variant="outline" asChild><Link href="/dashboard/reports"><BarChart3 className="mr-2 size-4" /> Semua laporan</Link></Button><Button className="bg-emerald-600 hover:bg-emerald-700" asChild><Link href="/dashboard/pos"><ShoppingBag className="mr-2 size-4" /> Buka kasir</Link></Button></div></section>
     {error && <Card className="border-destructive/40"><CardContent className="flex items-center justify-between gap-3 p-4 text-sm text-destructive"><span>{error}</span><Button variant="outline" size="sm" onClick={() => setReloadKey((value) => value + 1)}>Coba lagi</Button></CardContent></Card>}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{kpis.map((item) => <Card key={item.label} className="shadow-sm"><CardContent className="p-5"><div className={`flex size-11 items-center justify-center rounded-xl ${item.bg}`}><item.icon className={`size-5 ${item.color}`} /></div><p className="mt-4 text-sm text-muted-foreground">{item.label}</p><p className="mt-1 text-2xl font-bold">{item.value}</p><p className="mt-2 text-xs text-muted-foreground">{item.note}</p></CardContent></Card>)}</section>
    <section className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
      <Card className="shadow-sm">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-3">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base font-bold">Tren Penjualan</CardTitle>
              <Badge variant="outline" className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200">
                {totalPeriodOrders} Transaksi
              </Badge>
            </div>
            <CardDescription className="text-xs mt-0.5">
              Total {rupiah(totalPeriodSales)} • Rata-rata {rupiah(avgDailySales)}/hari
            </CardDescription>
          </div>
          <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl border">
            {([7, 14, 30] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                  days === d
                    ? "bg-background text-foreground shadow-xs border"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {d} Hari
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {dashboard.trend.length ? (
            <div className="h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dashboard.trend} margin={{ top: 10, right: 15, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="sales-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#059669" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#059669" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted/60" />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tickMargin={8}
                    tick={{ fontSize: 11, fill: "currentColor" }}
                    className="text-muted-foreground"
                    tickFormatter={(value) => {
                      const d = new Date(value)
                      return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" })
                    }}
                  />
                  <YAxis
                    domain={[0, yMax]}
                    ticks={yTicks}
                    axisLine={false}
                    tickLine={false}
                    tickMargin={8}
                    width={75}
                    tick={{ fontSize: 10, fill: "currentColor" }}
                    className="text-muted-foreground"
                    tickFormatter={(value) => {
                      const num = Number(value)
                      if (num === 0) return "Rp 0"
                      if (num >= 1_000_000) return `Rp ${(num / 1_000_000).toFixed(num % 1_000_000 === 0 ? 0 : 1)}jt`
                      if (num >= 1_000) return `Rp ${(num / 1_000).toFixed(0)}rb`
                      return `Rp ${num}`
                    }}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload
                        const dateObj = new Date(label)
                        const formattedDate = dateObj.toLocaleDateString("id-ID", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                        return (
                          <div className="rounded-xl border bg-background/95 p-3 shadow-xl backdrop-blur-md text-xs space-y-1.5 min-w-[170px]">
                            <p className="font-bold text-foreground border-b pb-1">{formattedDate}</p>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-muted-foreground">Total Penjualan:</span>
                              <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                                {rupiah(Number(data.sales || 0))}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-muted-foreground">Total Transaksi:</span>
                              <span className="font-semibold text-foreground">{data.orders || 0} pesanan</span>
                            </div>
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="sales"
                    stroke="#059669"
                    strokeWidth={2.5}
                    fill="url(#sales-fill)"
                    activeDot={{ r: 5, stroke: "#059669", strokeWidth: 2, fill: "#ffffff" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty message="Belum ada penjualan untuk ditampilkan." />
          )}
        </CardContent>
      </Card>
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Produk terlaris</CardTitle>
          <CardDescription>Berdasarkan transaksi aktual</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {dashboard.topProducts.length ? (
            dashboard.topProducts.map((product, index) => (
              <div key={product.name} className="flex items-center gap-3">
                <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-sm font-bold">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{product.name}</p>
                  <p className="text-xs text-muted-foreground">{product.quantity} terjual</p>
                </div>
                <p className="text-sm font-semibold">{rupiah(product.sales)}</p>
              </div>
            ))
          ) : (
            <Empty message="Produk terlaris akan muncul setelah ada transaksi." />
          )}
        </CardContent>
      </Card>
    </section>
         <section className="grid gap-4">
       <div className="grid gap-2 sm:grid-cols-5">
         <QuickReportLink href="/dashboard/reports/sales" title="Laporan Penjualan" icon={TrendingUp} color="emerald" />
         <QuickReportLink href="/dashboard/reports/inventory" title="Laporan Stok" icon={PackagePlus} color="blue" />
         <QuickReportLink href="/dashboard/reports/purchases" title="Laporan Pembelian" icon={ReceiptText} color="purple" />
         <QuickReportLink href="/dashboard/reports/finance" title="Laporan Keuangan" icon={Banknote} color="amber" />
         <QuickReportLink href="/dashboard/reports/customers" title="Laporan Pelanggan" icon={Users} color="rose" />
       </div>
     </section>
     <section className="grid gap-4 lg:grid-cols-3"><Card className="lg:col-span-2 shadow-sm"><CardHeader className="flex-row items-center justify-start gap-4"><div><CardTitle>Aktivitas terkini</CardTitle><CardDescription>Transaksi aktual terbaru</CardDescription></div><Button variant="ghost" size="sm" asChild><Link href="/dashboard/sales">Semua <ArrowRight /></Link></Button></CardHeader><CardContent className="space-y-1">{dashboard.recentSales.length ? dashboard.recentSales.map((sale) => <div key={sale.id} className="flex items-center gap-3 rounded-xl p-3 hover:bg-muted/60"><span className="flex size-10 items-center justify-center rounded-xl bg-emerald-100"><ReceiptText className="size-5 text-emerald-600" /></span><div className="min-w-0 flex-1"><p className="truncate font-medium">{sale.product_names}</p><p className="text-xs text-muted-foreground">{sale.order_number} • {sale.customer_name} • {sale.payment_methods || "Belum dibayar"}</p></div><div className="text-right"><p className="font-semibold">{rupiah(sale.total_amount)}</p><Badge variant="outline">{sale.status}</Badge></div></div>) : <Empty message="Belum ada transaksi. Buka kasir untuk memulai." />}</CardContent></Card><div className="space-y-4"><Card className="shadow-sm"><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="size-5 text-amber-600" /> Stok perlu perhatian</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">{dashboard.lowStock.length ? dashboard.lowStock.map((item) => <div key={item.id} className="flex justify-between gap-2"><span className="truncate">{item.name}{item.variant === "Default" ? "" : ` - ${item.variant}`}</span><Badge variant={Number(item.available) <= 0 ? "destructive" : "outline"}>{item.available} tersisa</Badge></div>) : <p className="py-3 text-center text-muted-foreground">Tidak ada stok menipis.</p>}<Button variant="outline" className="w-full" asChild><Link href="/dashboard/inventory">Kelola stok</Link></Button></CardContent></Card><Card><CardHeader className="pb-3"><CardTitle className="text-base">Aksi cepat</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-2"><Button variant="outline" className="h-auto flex-col gap-2 py-4" asChild><Link href="/dashboard/products"><PackagePlus className="text-blue-600" />Produk</Link></Button><Button variant="outline" className="h-auto flex-col gap-2 py-4" asChild><Link href="/dashboard/customers"><UserPlus className="text-violet-600" />Pelanggan</Link></Button></CardContent></Card></div></section>
  </div>
}

function Empty({ message }: { message: string }) {
  return <div className="flex min-h-32 items-center justify-center rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">{message}</div>
}

function QuickReportLink({
  href,
  title,
  icon: Icon,
  color,
}: {
  href: string
  title: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  color: "emerald" | "blue" | "purple" | "amber" | "rose"
}) {
  const colorMap = {
    emerald: "bg-emerald-100 text-emerald-600 hover:bg-emerald-200",
    blue: "bg-blue-100 text-blue-600 hover:bg-blue-200",
    purple: "bg-purple-100 text-purple-600 hover:bg-purple-200",
    amber: "bg-amber-100 text-amber-600 hover:bg-amber-200",
    rose: "bg-rose-100 text-rose-600 hover:bg-rose-200",
  }

  return (
    <Link
      href={href}
      className={`flex flex-col items-center justify-center rounded-lg p-4 transition-colors ${colorMap[color]}`}
    >
      <Icon className="size-6 mb-2" />
      <span className="text-center text-sm font-medium">{title}</span>
    </Link>
  )
}
