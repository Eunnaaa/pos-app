"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, Banknote, Clock, Hourglass, Loader2, Package, ReceiptText, ShoppingBag, TrendingUp, Wallet } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { apiFetch } from "@/lib/client"
import { subscribeToTable } from "@/lib/client/realtime"
import { useOrganization } from "@/components/kasir/organization-provider"
import { useSession } from "@/lib/auth-client"
import { showError } from "@/lib/toast-handler"

interface ShiftData {
  id: string
  opening_amount: string
  opened_at: string
  shift_hours?: number
  register_name: string
  register_code: string
  elapsed_seconds: number
  expected_cash: string
  cash_in: string
  cash_out: string
  cash_change: string
  payments: Record<string, string>
  items_sold: string
}

interface CashierDashboardData {
  summary: { sales: string; orders: number; customers: number; cost: string; avg_transaction: string }
  recentSales: { id: string; order_number: string; total_amount: string; status: string; customer_name: string; payment_methods: string; product_names: string }[]
  shift: ShiftData | null
  heldOrders: number
  pendingPayments: number
  topProducts: { name: string; quantity: string; sales: string }[]
  lowStock: { name: string; variant: string; available: string; reorder_point: string }[]
}

const emptyData: CashierDashboardData = {
  summary: { sales: "0", orders: 0, customers: 0, cost: "0", avg_transaction: "0" },
  recentSales: [], shift: null, heldOrders: 0, pendingPayments: 0, topProducts: [], lowStock: [],
}

const rupiah = (value: string | number) => `Rp ${Number(value).toLocaleString("id-ID")}`
const methodLabels: Record<string, string> = { cash: "Tunai", qris: "QRIS", debit: "Kartu", credit: "Kredit", e_wallet: "E-Wallet", transfer: "Transfer", pay_later: "Pay Later", store_credit: "Store Credit" }

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h} jam ${m}m`
  if (m > 0) return `${m} menit`
  return "baru saja"
}

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
    window.addEventListener("kedai-ku-context-change", refresh)
    return () => window.removeEventListener("kedai-ku-context-change", refresh)
  }, [load])

  const orgId = organization?.id
  useEffect(() => {
    if (!orgId) return
    const unsubscribe = subscribeToTable("sales_orders", orgId, () => void load())
    return unsubscribe
  }, [orgId, load])

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="size-8 animate-spin text-emerald-600" /></div>

  const { summary, shift, heldOrders, pendingPayments, topProducts, lowStock, recentSales } = data
  const hasAlerts = heldOrders > 0 || pendingPayments > 0 || lowStock.length > 0
  const maxPayment = shift ? Math.max(...Object.values(shift.payments).map(Number), 1) : 1

  return <div className="flex flex-1 flex-col gap-5 p-4 md:p-6">
    {/* Header */}
    <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Selamat datang, {session?.user.name || "Kasir"}</h2>
        <p className="text-muted-foreground">Ringkasan penjualan dan shift Anda hari ini.</p>
      </div>
      <div className="flex gap-2">
        {shift && <Button variant="outline" asChild><Link href="/dashboard/pos"><Wallet className="mr-2 size-4" /> Kelola shift</Link></Button>}
        <Button className="bg-emerald-600 hover:bg-emerald-700" asChild><Link href="/dashboard/pos"><ShoppingBag className="mr-2 size-4" /> Buka kasir</Link></Button>
      </div>
    </section>

    {error && <Card className="border-destructive/40"><CardContent className="p-4 text-sm text-destructive">{error}</CardContent></Card>}

    {/* Shift status card */}
    {shift ? (
      <Card className="border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/30">
        <CardContent className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900"><Clock className="size-5 text-emerald-600" /></span>
              <div>
                <p className="flex items-center gap-2 font-semibold">{shift.register_name} <Badge variant="outline" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">Shift aktif</Badge></p>
                <p className="text-xs text-muted-foreground">Dibuka {new Date(shift.opened_at).toLocaleString("id-ID")} • {formatElapsed(shift.elapsed_seconds)}{shift.shift_hours ? ` • Jaga ${shift.shift_hours} jam` : ""}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Kas seharusnya di laci</p>
              <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{rupiah(shift.expected_cash)}</p>
              <p className="text-xs text-muted-foreground">Kas awal {rupiah(shift.opening_amount)}</p>
            </div>
          </div>
          {/* Payment method breakdown */}
          {Object.keys(shift.payments).length > 0 && (
            <div className="mt-4 space-y-2 border-t pt-4">
              <p className="text-xs font-medium text-muted-foreground">Pembayaran shift ini</p>
              {Object.entries(shift.payments).map(([method, amount]) => (
                <div key={method} className="flex items-center gap-3">
                  <span className="w-20 text-xs text-muted-foreground">{methodLabels[method] ?? method}</span>
                  <div className="h-6 flex-1 overflow-hidden rounded bg-muted">
                    <div className="flex h-full items-center justify-end rounded bg-emerald-500/70 px-2" style={{ width: `${Math.max((Number(amount) / maxPayment) * 100, 8)}%` }}>
                      <span className="text-xs font-medium text-white">{rupiah(amount)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    ) : (
      <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20">
        <CardContent className="flex items-center gap-3 p-5">
          <span className="flex size-11 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900"><Hourglass className="size-5 text-amber-600" /></span>
          <div className="flex-1">
            <p className="font-semibold">Shift belum dibuka</p>
            <p className="text-sm text-muted-foreground">Buka shift kasir untuk mulai bertransaksi dan melacak kas.</p>
          </div>
          <Button className="bg-emerald-600 hover:bg-emerald-700" asChild><Link href="/dashboard/pos">Buka shift</Link></Button>
        </CardContent>
      </Card>
    )}

    {/* KPI grid */}
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Kpi icon={Banknote} label="Penjualan saya" value={rupiah(summary.sales)} />
      <Kpi icon={ReceiptText} label="Transaksi" value={String(summary.orders)} />
      <Kpi icon={TrendingUp} label="Rata-rata transaksi" value={summary.orders > 0 ? rupiah(summary.avg_transaction) : "—"} />
      <Kpi icon={Package} label="Item terjual" value={shift?.items_sold ?? "0"} />
    </section>

    {/* Alerts */}
    {hasAlerts && (
      <section className="grid gap-3 sm:grid-cols-3">
        {heldOrders > 0 && (
          <Card className="border-amber-200 dark:border-amber-900/50"><CardContent className="flex items-center gap-3 p-4">
            <span className="flex size-9 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900"><Hourglass className="size-4 text-amber-600" /></span>
            <div><p className="text-sm font-semibold">{heldOrders} order tertahan</p><p className="text-xs text-muted-foreground">Perlu dilanjutkan atau dibatalkan</p></div>
          </CardContent></Card>
        )}
        {pendingPayments > 0 && (
          <Card className="border-blue-200 dark:border-blue-900/50"><CardContent className="flex items-center gap-3 p-4">
            <span className="flex size-9 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900"><AlertTriangle className="size-4 text-blue-600" /></span>
            <div><p className="text-sm font-semibold">{pendingPayments} pembayaran pending</p><p className="text-xs text-muted-foreground">Menunggu konfirmasi online</p></div>
          </CardContent></Card>
        )}
        {lowStock.length > 0 && (
          <Card className="border-rose-200 dark:border-rose-900/50"><CardContent className="flex items-center gap-3 p-4">
            <span className="flex size-9 items-center justify-center rounded-lg bg-rose-100 dark:bg-rose-900"><AlertTriangle className="size-4 text-rose-600" /></span>
            <div><p className="text-sm font-semibold">{lowStock.length} produk hampir habis</p><p className="text-xs text-muted-foreground">{lowStock[0]?.name}{lowStock.length > 1 ? ` +${lowStock.length - 1}` : ""}</p></div>
          </CardContent></Card>
        )}
      </section>
    )}

    {/* Top products + Recent transactions */}
    <div className="grid gap-5 lg:grid-cols-[1fr_1.5fr]">
      {topProducts.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-base">Produk terlaris hari ini</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {topProducts.map((product, index) => (
              <div key={product.name} className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/60">
                <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-100 text-sm font-bold text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">{index + 1}</span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{product.name}</p><p className="text-xs text-muted-foreground">{product.quantity} terjual</p></div>
                <p className="text-sm font-semibold">{rupiah(product.sales)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="shadow-sm">
        <CardHeader className="flex-row items-center justify-between"><CardTitle className="text-base">Transaksi terbaru</CardTitle><Button variant="ghost" size="sm" asChild><Link href="/dashboard/sales">Semua transaksi</Link></Button></CardHeader>
        <CardContent className="space-y-2">
          {recentSales.length ? recentSales.map((sale) => (
            <div key={sale.id} className="flex items-center gap-3 rounded-xl p-3 hover:bg-muted/60">
              <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950"><ReceiptText className="size-5 text-emerald-600" /></span>
              <div className="min-w-0 flex-1"><p className="truncate font-medium">{sale.product_names}</p><p className="text-xs text-muted-foreground">{sale.order_number} • {sale.customer_name} • {sale.payment_methods || "Belum dibayar"}</p></div>
              <div className="text-right"><p className="font-semibold">{rupiah(sale.total_amount)}</p><Badge variant="outline">{sale.status}</Badge></div>
            </div>
          )) : <p className="py-10 text-center text-sm text-muted-foreground">Belum ada transaksi hari ini.</p>}
        </CardContent>
      </Card>
    </div>
  </div>
}

function Kpi({ icon: Icon, label, value }: { icon: typeof Banknote; label: string; value: string }) {
  return <Card className="shadow-sm"><CardContent className="p-5"><div className="flex size-11 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950"><Icon className="size-5 text-emerald-600" /></div><p className="mt-4 text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></CardContent></Card>
}
