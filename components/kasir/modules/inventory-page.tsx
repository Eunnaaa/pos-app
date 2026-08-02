"use client"

import { useMemo, useState } from "react"
import { ArrowDown, ArrowUp, Boxes, Loader2, Search, SlidersHorizontal } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useOrganization } from "@/components/kasir/organization-provider"
import { useResource } from "@/hooks/use-resource"
import { apiFetch } from "@/lib/client"

type Product = { id: string; name: string }
type Variant = { id: string; product_id: string; name: string; sku: string }
type Balance = { id: string; warehouse_id: string; variant_id: string; on_hand: string; reserved: string; available: string; reorder_point: string; reorder_quantity: string; average_cost_amount: string }
type Movement = { id: string; variant_id: string; type: string; quantity: string; before_quantity: string; after_quantity: string; reason?: string; occurred_at: string }

export function InventoryPage() {
  const { branch, warehouse } = useOrganization()
  const products = useResource<Product>("products", "limit=100")
  const variants = useResource<Variant>("variants", "limit=100")
  const balances = useResource<Balance>("stock-balances", "limit=100")
  const movements = useResource<Movement>("stock-movements", "limit=100")
  const [search, setSearch] = useState("")
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ variantId: "", quantity: "", reason: "" })

  const names = useMemo(() => new Map(variants.data.map((variant) => {
    const product = products.data.find((item) => item.id === variant.product_id)
    return [variant.id, `${product?.name || "Produk"}${variant.name === "Default" ? "" : ` - ${variant.name}`} (${variant.sku})`]
  })), [products.data, variants.data])
  const visibleBalances = balances.data.filter((balance) => balance.warehouse_id === warehouse?.id && (names.get(balance.variant_id) || "").toLowerCase().includes(search.toLowerCase()))
  const low = visibleBalances.filter((item) => BigInt(item.available) <= BigInt(item.reorder_point))
  const inventoryValue = visibleBalances.reduce((sum, item) => sum + BigInt(item.on_hand) * BigInt(item.average_cost_amount), 0n)

  async function adjust(event: React.FormEvent) {
    event.preventDefault(); setSaving(true)
    try {
      if (!warehouse?.id) throw new Error("Gudang belum dipilih")
      await apiFetch("/api/v1/inventory/adjustments", { method: "POST", queueOffline: true, body: JSON.stringify({ branchId: branch?.id, warehouseId: warehouse.id, variantId: form.variantId, quantity: form.quantity, reason: form.reason }) })
      toast.success("Penyesuaian stok tersimpan"); setOpen(false); setForm({ variantId: "", quantity: "", reason: "" }); await Promise.all([balances.refresh(), movements.refresh()])
    } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Gagal menyesuaikan stok") }
    finally { setSaving(false) }
  }

  const loading = balances.loading || variants.loading || products.loading
  return <div className="flex flex-1 flex-col gap-5 p-4 md:p-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-2xl font-bold">Inventory & Stok</h2><p className="text-sm text-muted-foreground">Saldo dan movement aktual untuk {warehouse?.name || "gudang aktif"}.</p></div><Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setOpen(true)}><SlidersHorizontal /> Penyesuaian stok</Button></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">SKU tercatat</p><p className="mt-2 text-2xl font-bold">{visibleBalances.length}</p></CardContent></Card><Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Total unit tersedia</p><p className="mt-2 text-2xl font-bold">{visibleBalances.reduce((sum, item) => sum + Number(item.available), 0)}</p></CardContent></Card><Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Stok menipis</p><p className="mt-2 text-2xl font-bold text-amber-600">{low.length}</p></CardContent></Card><Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Nilai stok (HPP)</p><p className="mt-2 text-2xl font-bold">Rp {Number(inventoryValue).toLocaleString("id-ID")}</p></CardContent></Card></div>
    <Card><Tabs defaultValue="stock"><CardHeader className="border-b"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><TabsList><TabsTrigger value="stock">Stok</TabsTrigger><TabsTrigger value="movement">Movement</TabsTrigger></TabsList><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari SKU/produk" className="pl-9 sm:w-72" /></div></div></CardHeader><CardContent className="p-0"><TabsContent value="stock" className="m-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Produk / SKU</TableHead><TableHead>On hand</TableHead><TableHead>Reserved</TableHead><TableHead>Available</TableHead><TableHead>Reorder point</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{loading && <TableRow><TableCell colSpan={6} className="h-32 text-center"><Loader2 className="mx-auto animate-spin" /></TableCell></TableRow>}{!loading && !visibleBalances.length && <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">Belum ada saldo stok. Tambahkan stok awal dari halaman produk atau adjustment.</TableCell></TableRow>}{visibleBalances.map((item) => { const isLow = BigInt(item.available) <= BigInt(item.reorder_point); return <TableRow key={item.id}><TableCell className="font-medium">{names.get(item.variant_id) || item.variant_id}</TableCell><TableCell>{item.on_hand}</TableCell><TableCell>{item.reserved}</TableCell><TableCell>{item.available}</TableCell><TableCell>{item.reorder_point}</TableCell><TableCell><Badge variant={isLow ? "secondary" : "default"} className={isLow ? "text-amber-700" : "bg-emerald-600"}>{isLow ? "Menipis" : "Aman"}</Badge></TableCell></TableRow> })}</TableBody></Table></div></TabsContent><TabsContent value="movement" className="m-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Waktu</TableHead><TableHead>Produk / SKU</TableHead><TableHead>Tipe</TableHead><TableHead>Qty</TableHead><TableHead>Sebelum</TableHead><TableHead>Sesudah</TableHead><TableHead>Alasan</TableHead></TableRow></TableHeader><TableBody>{movements.data.filter((item) => names.has(item.variant_id)).map((item) => <TableRow key={item.id}><TableCell>{new Date(item.occurred_at).toLocaleString("id-ID")}</TableCell><TableCell className="font-medium">{names.get(item.variant_id)}</TableCell><TableCell><Badge variant="outline">{item.type}</Badge></TableCell><TableCell className={BigInt(item.quantity) >= 0n ? "text-emerald-600" : "text-rose-600"}>{BigInt(item.quantity) >= 0n ? <ArrowUp className="mr-1 inline size-3" /> : <ArrowDown className="mr-1 inline size-3" />}{item.quantity}</TableCell><TableCell>{item.before_quantity}</TableCell><TableCell>{item.after_quantity}</TableCell><TableCell>{item.reason || "—"}</TableCell></TableRow>)}</TableBody></Table></div></TabsContent></CardContent></Tabs></Card>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><form onSubmit={adjust}><DialogHeader><DialogTitle className="flex items-center gap-2"><Boxes className="text-emerald-600" /> Penyesuaian stok</DialogTitle><DialogDescription>Gunakan angka positif untuk menambah, negatif untuk mengurangi.</DialogDescription></DialogHeader><div className="space-y-4 py-5"><div className="space-y-2"><Label>Produk / varian</Label><Select value={form.variantId} onValueChange={(value) => setForm((current) => ({ ...current, variantId: value }))}><SelectTrigger><SelectValue placeholder="Pilih produk" /></SelectTrigger><SelectContent>{variants.data.map((item) => <SelectItem key={item.id} value={item.id}>{names.get(item.id)}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Perubahan kuantitas</Label><Input type="number" value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} placeholder="Contoh: 10 atau -2" required /></div><div className="space-y-2"><Label>Alasan</Label><Input value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} placeholder="Stok awal / barang rusak / koreksi" required minLength={3} /></div></div><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button><Button className="bg-emerald-600 hover:bg-emerald-700" disabled={saving || !form.variantId}>{saving && <Loader2 className="animate-spin" />} Simpan</Button></DialogFooter></form></DialogContent></Dialog>
  </div>
}
