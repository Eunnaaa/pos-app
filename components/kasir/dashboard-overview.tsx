"use client"

import { useEffect, useState } from "react"
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

interface DashboardData {
  summary: { sales: string; profit: string; orders: number; customers: number }
  trend: { date: string; sales: string; orders: number }[]
  topProducts: { name: string; quantity: string; sales: string }[]
  lowStock: { id: string; name: string; variant: string; available: string; reorder_point: string }[]
  recentSales: { id: string; order_number: string; total_amount: string; status: string; occurred_at: string; customer_name: string; payment_methods: string }[]
}

const emptyData: DashboardData = {
  summary: { sales: "0", profit: "0", orders: 0, customers: 0 },
  trend: [], topProducts: [], lowStock: [], recentSales: [],
}

const rupiah = (value: string | number) => `Rp ${Number(value).toLocaleString("id-ID")}`

export function DashboardOverview() {
  const { data: session } = useSession()
  const [dashboard, setDashboard] = useState<DashboardData>(emptyData)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    async function load() {
      setLoading(true); setError("")
      try {
        const response = await apiFetch<DashboardData>("/api/v1/dashboard")
        setDashboard(response.data)
      } catch (caught) { setError(caught instanceof Error ? caught.message : "Gagal mengambil dashboard") }
      finally { setLoading(false) }
    }
    void load()
    const refresh = () => void load()
    window.addEventListener("kasir-ku-context-change", refresh)
    return () => window.removeEventListener("kasir-ku-context-change", refresh)
  }, [])

  const kpis = [
    { label: "Penjualan hari ini", value: rupiah(dashboard.summary.sales), note: "Transaksi berstatus selesai", icon: Banknote, color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-950" },
    { label: "Profit hari ini", value: rupiah(dashboard.summary.profit), note: "Penjualan dikurangi HPP", icon: TrendingUp, color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-950" },
    { label: "Total order", value: String(dashboard.summary.orders), note: "Order hari ini", icon: ShoppingBag, color: "text-violet-600", bg: "bg-violet-100 dark:bg-violet-950" },
    { label: "Pelanggan", value: String(dashboard.summary.customers), note: "Pelanggan unik hari ini", icon: Users, color: "text-orange-600", bg: "bg-orange-100 dark:bg-orange-950" },
  ]

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="size-8 animate-spin text-emerald-600" /></div>

  return <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
    <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-2xl font-bold tracking-tight">Selamat datang, {session?.user.name || "Pengguna"}</h2><p className="text-muted-foreground">Ringkasan bisnis berdasarkan data aktual.</p></div><div className="flex gap-2"><Button variant="outline" asChild><Link href="/dashboard/reports"><BarChart3 className="mr-2 size-4" /> Semua laporan</Link></Button><Button className="bg-emerald-600 hover:bg-emerald-700" asChild><Link href="/dashboard/pos"><ShoppingBag className="mr-2 size-4" /> Buka kasir</Link></Button></div></section>
    {error && <Card className="border-destructive/40"><CardContent className="p-4 text-sm text-destructive">{error}</CardContent></Card>}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{kpis.map((item) => <Card key={item.label} className="shadow-sm"><CardContent className="p-5"><div className={`flex size-11 items-center justify-center rounded-xl ${item.bg}`}><item.icon className={`size-5 ${item.color}`} /></div><p className="mt-4 text-sm text-muted-foreground">{item.label}</p><p className="mt-1 text-2xl font-bold">{item.value}</p><p className="mt-2 text-xs text-muted-foreground">{item.note}</p></CardContent></Card>)}</section>
    <section className="grid gap-4 xl:grid-cols-[1.7fr_1fr]"><Card className="shadow-sm"><CardHeader><CardTitle>Tren penjualan</CardTitle><CardDescription>Data 30 hari terakhir</CardDescription></CardHeader><CardContent>{dashboard.trend.length ? <div className="h-72"><ResponsiveContainer width="100%" height="100%"><AreaChart data={dashboard.trend}><defs><linearGradient id="sales-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#059669" stopOpacity={0.35} /><stop offset="95%" stopColor="#059669" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="date" axisLine={false} tickLine={false} tickFormatter={(value) => new Date(value).toLocaleDateString("id-ID", { day: "numeric", month: "short" })} /><YAxis hide /><Tooltip formatter={(value) => rupiah(Number(value))} /><Area type="monotone" dataKey="sales" stroke="#059669" strokeWidth={3} fill="url(#sales-fill)" /></AreaChart></ResponsiveContainer></div> : <Empty message="Belum ada penjualan untuk ditampilkan." />}</CardContent></Card><Card className="shadow-sm"><CardHeader><CardTitle>Produk terlaris</CardTitle><CardDescription>Berdasarkan transaksi aktual</CardDescription></CardHeader><CardContent className="space-y-4">{dashboard.topProducts.length ? dashboard.topProducts.map((product, index) => <div key={product.name} className="flex items-center gap-3"><span className="flex size-8 items-center justify-center rounded-lg bg-muted text-sm font-bold">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{product.name}</p><p className="text-xs text-muted-foreground">{product.quantity} terjual</p></div><p className="text-sm font-semibold">{rupiah(product.sales)}</p></div>) : <Empty message="Produk terlaris akan muncul setelah ada transaksi." />}</CardContent></Card></section>
         <section className="grid gap-4">
       <div className="grid gap-2 sm:grid-cols-5">
         <QuickReportLink href="/dashboard/reports/sales" title="Laporan Penjualan" icon={TrendingUp} color="emerald" />
         <QuickReportLink href="/dashboard/reports/inventory" title="Laporan Stok" icon={PackagePlus} color="blue" />
         <QuickReportLink href="/dashboard/reports/purchases" title="Laporan Pembelian" icon={ReceiptText} color="purple" />
         <QuickReportLink href="/dashboard/reports/finance" title="Laporan Keuangan" icon={Banknote} color="amber" />
         <QuickReportLink href="/dashboard/reports/customers" title="Laporan Pelanggan" icon={Users} color="rose" />
       </div>
     </section>
     <section className="grid gap-4 lg:grid-cols-3"><Card className="lg:col-span-2 shadow-sm"><CardHeader className="flex-row items-center justify-between"><div><CardTitle>Aktivitas terkini</CardTitle><CardDescription>Transaksi aktual terbaru</CardDescription></div><Button variant="ghost" size="sm" asChild><Link href="/dashboard/sales">Semua <ArrowRight /></Link></Button></CardHeader><CardContent className="space-y-1">{dashboard.recentSales.length ? dashboard.recentSales.map((sale) => <div key={sale.id} className="flex items-center gap-3 rounded-xl p-3 hover:bg-muted/60"><span className="flex size-10 items-center justify-center rounded-xl bg-emerald-100"><ReceiptText className="size-5 text-emerald-600" /></span><div className="min-w-0 flex-1"><p className="font-medium">{sale.order_number}</p><p className="text-xs text-muted-foreground">{sale.customer_name} • {sale.payment_methods || "Belum dibayar"}</p></div><div className="text-right"><p className="font-semibold">{rupiah(sale.total_amount)}</p><Badge variant="outline">{sale.status}</Badge></div></div>) : <Empty message="Belum ada transaksi. Buka kasir untuk memulai." />}</CardContent></Card><div className="space-y-4"><Card className="shadow-sm"><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="size-5 text-amber-600" /> Stok perlu perhatian</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">{dashboard.lowStock.length ? dashboard.lowStock.map((item) => <div key={item.id} className="flex justify-between gap-2"><span className="truncate">{item.name}{item.variant === "Default" ? "" : ` - ${item.variant}`}</span><Badge variant={Number(item.available) <= 0 ? "destructive" : "outline"}>{item.available} tersisa</Badge></div>) : <p className="py-3 text-center text-muted-foreground">Tidak ada stok menipis.</p>}<Button variant="outline" className="w-full" asChild><Link href="/dashboard/inventory">Kelola stok</Link></Button></CardContent></Card><Card><CardHeader className="pb-3"><CardTitle className="text-base">Aksi cepat</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-2"><Button variant="outline" className="h-auto flex-col gap-2 py-4" asChild><Link href="/dashboard/products"><PackagePlus className="text-blue-600" />Produk</Link></Button><Button variant="outline" className="h-auto flex-col gap-2 py-4" asChild><Link href="/dashboard/customers"><UserPlus className="text-violet-600" />Pelanggan</Link></Button></CardContent></Card></div></section>
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
