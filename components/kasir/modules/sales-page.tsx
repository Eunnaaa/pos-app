"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, RefreshCw, RotateCcw, Search } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { apiFetch } from "@/lib/client"

type Sale = { id: string; order_number: string; status: string; total_amount: string; paid_amount: string; occurred_at: string; customer_name?: string; payment_methods: string; item_count: number }
type SaleItem = { id: string; itemName?: string; item_name?: string; sku?: string; quantity: string; totalAmount?: string; total_amount?: string; variantId?: string; variant_id?: string }
type SaleDetail = { order: { id: string; orderNumber?: string; order_number?: string; status: string; totalAmount?: string; total_amount?: string }; items: SaleItem[]; payments: { id: string; method: string; amount: string; status: string }[]; receipt?: { verificationToken?: string; verification_token?: string } }
const rupiah = (value: string | number) => `Rp ${Number(value).toLocaleString("id-ID")}`

export function SalesPage() {
  const [data, setData] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [detail, setDetail] = useState<SaleDetail>()
  const [returnOpen, setReturnOpen] = useState(false)
  const [returnReason, setReturnReason] = useState("")
  const [returnQuantities, setReturnQuantities] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setData((await apiFetch<Sale[]>(`/api/v1/sales?q=${encodeURIComponent(search)}&limit=100`)).data) }
    catch (caught) { toast.error(caught instanceof Error ? caught.message : "Gagal mengambil transaksi") }
    finally { setLoading(false) }
  }, [search])
  useEffect(() => { const timer = window.setTimeout(() => void load(), 250); return () => window.clearTimeout(timer) }, [load])

  async function showDetail(id: string) {
    try { setDetail((await apiFetch<SaleDetail>(`/api/v1/sales/${id}`)).data) }
    catch (caught) { toast.error(caught instanceof Error ? caught.message : "Gagal mengambil detail") }
  }

  function prepareReturn() {
    if (!detail) return
    setReturnQuantities(Object.fromEntries(detail.items.map((item) => [item.id, "0"]))); setReturnReason(""); setReturnOpen(true)
  }

  async function submitReturn(event: React.FormEvent) {
    event.preventDefault(); if (!detail) return
    const items = detail.items.map((item) => ({ orderItemId: item.id, quantity: returnQuantities[item.id] || "0", restock: true })).filter((item) => BigInt(item.quantity) > 0n)
    if (!items.length) return toast.error("Masukkan minimal satu kuantitas return")
    setSaving(true)
    try {
      await apiFetch("/api/v1/sales/returns", { method: "POST", body: JSON.stringify({ orderId: detail.order.id, reason: returnReason, items }), queueOffline: true })
      toast.success("Return dan refund diproses"); setReturnOpen(false); setDetail(undefined); await load()
    } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Return gagal") }
    finally { setSaving(false) }
  }

  const total = data.reduce((sum, sale) => sum + Number(sale.total_amount), 0)
  return <div className="flex flex-1 flex-col gap-5 p-4 md:p-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-2xl font-bold">Transaksi Penjualan</h2><p className="text-sm text-muted-foreground">Order, payment, receipt, dan return berdasarkan data aktual.</p></div><Button variant="outline" onClick={() => void load()}><RefreshCw /> Refresh</Button></div><div className="grid gap-3 sm:grid-cols-3"><Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Total transaksi</p><p className="mt-2 text-2xl font-bold">{data.length}</p></CardContent></Card><Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Nilai transaksi</p><p className="mt-2 text-2xl font-bold">{rupiah(total)}</p></CardContent></Card><Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Refunded</p><p className="mt-2 text-2xl font-bold">{data.filter((sale) => sale.status.includes("refund")).length}</p></CardContent></Card></div><Card><CardHeader className="border-b"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle>Daftar transaksi</CardTitle><CardDescription>Klik transaksi untuk melihat detail.</CardDescription></div><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari invoice/customer" className="pl-9 sm:w-72" /></div></div></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Invoice</TableHead><TableHead>Waktu</TableHead><TableHead>Customer</TableHead><TableHead>Item</TableHead><TableHead>Pembayaran</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{loading && <TableRow><TableCell colSpan={7} className="h-32 text-center"><Loader2 className="mx-auto animate-spin" /></TableCell></TableRow>}{!loading && !data.length && <TableRow><TableCell colSpan={7} className="h-32 text-center text-muted-foreground">Belum ada transaksi. Gunakan POS untuk membuat transaksi pertama.</TableCell></TableRow>}{data.map((sale) => <TableRow key={sale.id} className="cursor-pointer" onClick={() => void showDetail(sale.id)}><TableCell className="font-medium">{sale.order_number}</TableCell><TableCell>{new Date(sale.occurred_at).toLocaleString("id-ID")}</TableCell><TableCell>{sale.customer_name || "Pelanggan umum"}</TableCell><TableCell>{sale.item_count}</TableCell><TableCell>{sale.payment_methods || "—"}</TableCell><TableCell>{rupiah(sale.total_amount)}</TableCell><TableCell><Badge variant="outline">{sale.status}</Badge></TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card><Dialog open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(undefined)}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>{detail?.order.orderNumber || detail?.order.order_number}</DialogTitle><DialogDescription>Detail item, pembayaran, dan receipt.</DialogDescription></DialogHeader>{detail && <div className="space-y-4"><Table><TableHeader><TableRow><TableHead>Item</TableHead><TableHead>SKU</TableHead><TableHead>Qty</TableHead><TableHead>Total</TableHead></TableRow></TableHeader><TableBody>{detail.items.map((item) => <TableRow key={item.id}><TableCell>{item.itemName || item.item_name}</TableCell><TableCell>{item.sku || "—"}</TableCell><TableCell>{item.quantity}</TableCell><TableCell>{rupiah(item.totalAmount || item.total_amount || 0)}</TableCell></TableRow>)}</TableBody></Table><div className="rounded-lg bg-muted p-4"><div className="flex justify-between"><span>Total</span><strong>{rupiah(detail.order.totalAmount || detail.order.total_amount || 0)}</strong></div><div className="mt-2 flex justify-between text-sm"><span>Status</span><Badge variant="outline">{detail.order.status}</Badge></div><p className="mt-3 break-all text-xs text-muted-foreground">Verifikasi: {detail.receipt?.verificationToken || detail.receipt?.verification_token || "—"}</p></div></div>}<DialogFooter><Button variant="outline" onClick={() => window.print()}>Cetak</Button>{detail && ["paid", "partially_refunded"].includes(detail.order.status) && <Button variant="destructive" onClick={prepareReturn}><RotateCcw /> Return</Button>}</DialogFooter></DialogContent></Dialog><Dialog open={returnOpen} onOpenChange={setReturnOpen}><DialogContent><form onSubmit={submitReturn}><DialogHeader><DialogTitle>Return transaksi</DialogTitle><DialogDescription>Masukkan kuantitas yang dikembalikan. Stok akan ditambahkan kembali.</DialogDescription></DialogHeader><div className="space-y-3 py-5">{detail?.items.map((item) => <div key={item.id} className="grid grid-cols-[1fr_100px] items-center gap-3"><Label>{item.itemName || item.item_name} (maks. {item.quantity})</Label><Input type="number" min="0" max={item.quantity} value={returnQuantities[item.id] || "0"} onChange={(event) => setReturnQuantities((current) => ({ ...current, [item.id]: event.target.value }))} /></div>)}<div className="space-y-2"><Label>Alasan return</Label><Input value={returnReason} onChange={(event) => setReturnReason(event.target.value)} required minLength={3} /></div></div><DialogFooter><Button type="button" variant="outline" onClick={() => setReturnOpen(false)}>Batal</Button><Button variant="destructive" disabled={saving}>{saving && <Loader2 className="animate-spin" />} Proses return</Button></DialogFooter></form></DialogContent></Dialog></div>
}
