"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Banknote, Loader2, ReceiptText, ShoppingBag, Store, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { apiFetch } from "@/lib/client"
import { subscribeToTable } from "@/lib/client/realtime"
import { useOrganization } from "@/components/kasir/organization-provider"
import { useSession } from "@/lib/auth-client"
import { showError } from "@/lib/toast-handler"

interface CashierDashboardData {
  summary: { sales: string; orders: number; customers: number }
  recentSales: { id: string; order_number: string; total_amount: string; status: string; customer_name: string; payment_methods: string; product_names: string }[]
}

const emptyData: CashierDashboardData = { summary: { sales: "0", orders: 0, customers: 0 }, recentSales: [] }
const rupiah = (value: string | number) => `Rp ${Number(value).toLocaleString("id-ID")}`

export function CashierDashboardOverview() {
  const { data: session } = useSession()
  const { organization } = useOrganization()
  const [data, setData] = useState(emptyData)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const response = await apiFetch<CashierDashboardData>("/api/v1/dashboard/cashier")
      setData(response.data)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Gagal mengambil dashboard kasir"
      setError(message)
      showError(message, { error: caught })
    }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    void load()
    const refresh = () => void load()
    window.addEventListener("kasir-ku-context-change", refresh)
    return () => window.removeEventListener("kasir-ku-context-change", refresh)
  }, [load])

  const orgId = organization?.id
  useEffect(() => {
    if (!orgId) return
    const unsubscribe = subscribeToTable("sales_orders", orgId, () => void load())
    return unsubscribe
  }, [orgId, load])

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="size-8 animate-spin text-emerald-600" /></div>
  return <div className="flex flex-1 flex-col gap-6 p-4 md:p-6"><section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-2xl font-bold tracking-tight">Selamat datang, {session?.user.name || "Kasir"}</h2><p className="text-muted-foreground">Ringkasan penjualan dan shift cabang aktif.</p></div><Button className="bg-emerald-600 hover:bg-emerald-700" asChild><Link href="/dashboard/pos"><ShoppingBag className="mr-2 size-4" /> Buka kasir</Link></Button></section>{error && <Card className="border-destructive/40"><CardContent className="p-4 text-sm text-destructive">{error}</CardContent></Card>}<section className="grid gap-4 sm:grid-cols-3"><Kpi icon={Banknote} label="Penjualan saya" value={rupiah(data.summary.sales)} /><Kpi icon={ReceiptText} label="Transaksi saya" value={String(data.summary.orders)} /><Kpi icon={Users} label="Pelanggan" value={String(data.summary.customers)} /></section><Card className="shadow-sm"><CardHeader className="flex-row items-center justify-between"><CardTitle>Transaksi terbaru</CardTitle><Button variant="ghost" size="sm" asChild><Link href="/dashboard/sales">Semua transaksi</Link></Button></CardHeader><CardContent className="space-y-2">{data.recentSales.length ? data.recentSales.map((sale) => <div key={sale.id} className="flex items-center gap-3 rounded-xl p-3 hover:bg-muted/60"><span className="flex size-10 items-center justify-center rounded-xl bg-emerald-100"><ReceiptText className="size-5 text-emerald-600" /></span><div className="min-w-0 flex-1"><p className="truncate font-medium">{sale.product_names}</p><p className="text-xs text-muted-foreground">{sale.order_number} • {sale.customer_name} • {sale.payment_methods || "Belum dibayar"}</p></div><div className="text-right"><p className="font-semibold">{rupiah(sale.total_amount)}</p><Badge variant="outline">{sale.status}</Badge></div></div>) : <p className="py-10 text-center text-sm text-muted-foreground">Belum ada transaksi.</p>}</CardContent></Card><Card className="bg-emerald-50/70 dark:bg-emerald-950/20"><CardContent className="flex items-center gap-3 p-5"><Store className="size-5 text-emerald-600" /><p className="text-sm">Gunakan menu POS untuk memulai transaksi di cabang aktif.</p></CardContent></Card></div>
}

function Kpi({ icon: Icon, label, value }: { icon: typeof Banknote; label: string; value: string }) {
  return <Card className="shadow-sm"><CardContent className="p-5"><div className="flex size-11 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950"><Icon className="size-5 text-emerald-600" /></div><p className="mt-4 text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></CardContent></Card>
}
