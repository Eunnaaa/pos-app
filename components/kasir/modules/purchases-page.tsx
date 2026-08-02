"use client"

import { useMemo, useState } from "react"
import { Loader2, Plus, Search, Truck } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useOrganization } from "@/components/kasir/organization-provider"
import { useResource } from "@/hooks/use-resource"
import { apiFetch } from "@/lib/client"

type Supplier = { id: string; name: string; code: string; is_active: boolean }
type Product = { id: string; name: string }
type Variant = { id: string; product_id: string; name: string; sku: string; cost_amount: string; is_active: boolean }
type PurchaseOrder = { id: string; order_number: string; supplier_id: string; warehouse_id: string; status: string; order_date: string; expected_date?: string; total_amount: string; notes?: string }
type PurchaseDetail = { order: { id: string; status: string; warehouseId?: string; warehouse_id?: string }; items: { id: string; variantId?: string; variant_id?: string; quantity: string; receivedQuantity?: string; received_quantity?: string; unitCostAmount?: string; unit_cost_amount?: string; totalAmount?: string; total_amount?: string; sku: string; variantName?: string; variant_name?: string }[] }
type Line = { variantId: string; quantity: string; cost: string }
const rupiah = (value: string | number) => `Rp ${Number(value).toLocaleString("id-ID")}`

export function PurchasesPage() {
  const { branch, warehouse } = useOrganization()
  const orders = useResource<PurchaseOrder>("purchase-orders", "limit=100")
  const suppliers = useResource<Supplier>("suppliers", "limit=100")
  const products = useResource<Product>("products", "limit=100")
  const variants = useResource<Variant>("variants", "limit=100")
  const [search, setSearch] = useState("")
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [supplierId, setSupplierId] = useState("")
  const [expectedDate, setExpectedDate] = useState("")
  const [notes, setNotes] = useState("")
  const [lines, setLines] = useState<Line[]>([{ variantId: "", quantity: "1", cost: "0" }])
  const [detail, setDetail] = useState<PurchaseDetail>()
  const supplierNames = useMemo(() => new Map(suppliers.data.map((item) => [item.id, item.name])), [suppliers.data])
  const variantNames = useMemo(() => new Map(variants.data.map((variant) => [variant.id, `${products.data.find((product) => product.id === variant.product_id)?.name || "Produk"}${variant.name === "Default" ? "" : ` - ${variant.name}`} (${variant.sku})`])), [variants.data, products.data])
  const visible = orders.data.filter((order) => `${order.order_number} ${supplierNames.get(order.supplier_id) || ""}`.toLowerCase().includes(search.toLowerCase()))

  function reset() { setSupplierId(""); setExpectedDate(""); setNotes(""); setLines([{ variantId: "", quantity: "1", cost: "0" }]) }
  function changeLine(index: number, patch: Partial<Line>) { setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line)) }
  async function create(event: React.FormEvent) {
    event.preventDefault(); setSaving(true)
    try {
      if (!warehouse?.id) throw new Error("Gudang belum dipilih")
      if (lines.some((line) => !line.variantId || Number(line.quantity) <= 0)) throw new Error("Lengkapi item purchase order")
      await apiFetch("/api/v1/purchases/orders", { method: "POST", body: JSON.stringify({ branchId: branch?.id, warehouseId: warehouse.id, supplierId, expectedDate: expectedDate || undefined, notes: notes || undefined, status: "submitted", items: lines.map((line) => ({ variantId: line.variantId, quantity: line.quantity, unitCostAmount: line.cost })) }) })
      toast.success("Purchase order dibuat"); setOpen(false); reset(); await orders.refresh()
    } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Gagal membuat purchase order") }
    finally { setSaving(false) }
  }
  async function showDetail(id: string) {
    try { setDetail((await apiFetch<PurchaseDetail>(`/api/v1/purchases/orders/${id}`)).data) } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Gagal mengambil detail") }
  }
  async function receiveAll() {
    if (!detail || !warehouse?.id) return
    const items = detail.items.map((item) => ({
      purchaseOrderItemId: item.id,
      variantId: item.variantId || item.variant_id,
      acceptedQuantity: String(BigInt(item.quantity) - BigInt(item.receivedQuantity || item.received_quantity || "0")),
      unitCostAmount: item.unitCostAmount || item.unit_cost_amount || "0",
    })).filter((item) => BigInt(item.acceptedQuantity) > 0n)
    if (!items.length) return toast.info("Semua item sudah diterima")
    setSaving(true)
    try { await apiFetch("/api/v1/purchases/receipts", { method: "POST", body: JSON.stringify({ purchaseOrderId: detail.order.id, warehouseId: detail.order.warehouseId || detail.order.warehouse_id || warehouse.id, notes: "Penerimaan melalui management", items }) }); toast.success("Barang diterima dan stok diperbarui"); setDetail(undefined); await orders.refresh() }
    catch (caught) { toast.error(caught instanceof Error ? caught.message : "Penerimaan gagal") }
    finally { setSaving(false) }
  }
  const total = orders.data.reduce((sum, order) => sum + Number(order.total_amount), 0)

  return <div className="flex flex-1 flex-col gap-5 p-4 md:p-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-2xl font-bold">Pembelian</h2><p className="text-sm text-muted-foreground">Purchase order dan penerimaan barang aktual.</p></div><Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setOpen(true)}><Plus /> Buat PO</Button></div><div className="grid gap-3 sm:grid-cols-3"><Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Total PO</p><p className="mt-2 text-2xl font-bold">{orders.data.length}</p></CardContent></Card><Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">PO terbuka</p><p className="mt-2 text-2xl font-bold">{orders.data.filter((item) => !["received", "cancelled"].includes(item.status)).length}</p></CardContent></Card><Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Nilai PO</p><p className="mt-2 text-2xl font-bold">{rupiah(total)}</p></CardContent></Card></div><Card><CardHeader className="border-b"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle>Purchase order</CardTitle><CardDescription>Klik PO untuk detail dan penerimaan.</CardDescription></div><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nomor/supplier" className="pl-9 sm:w-72" /></div></div></CardHeader><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>No. PO</TableHead><TableHead>Supplier</TableHead><TableHead>Tanggal</TableHead><TableHead>Expected</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{orders.loading && <TableRow><TableCell colSpan={6} className="h-32 text-center"><Loader2 className="mx-auto animate-spin" /></TableCell></TableRow>}{!orders.loading && !visible.length && <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">Belum ada purchase order. Tambahkan supplier dan produk terlebih dahulu.</TableCell></TableRow>}{visible.map((order) => <TableRow key={order.id} className="cursor-pointer" onClick={() => void showDetail(order.id)}><TableCell className="font-medium">{order.order_number}</TableCell><TableCell>{supplierNames.get(order.supplier_id) || "—"}</TableCell><TableCell>{new Date(order.order_date).toLocaleDateString("id-ID")}</TableCell><TableCell>{order.expected_date ? new Date(order.expected_date).toLocaleDateString("id-ID") : "—"}</TableCell><TableCell>{rupiah(order.total_amount)}</TableCell><TableCell><Badge variant="outline">{order.status}</Badge></TableCell></TableRow>)}</TableBody></Table></CardContent></Card><Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-2xl"><form onSubmit={create}><DialogHeader><DialogTitle className="flex items-center gap-2"><Truck className="text-emerald-600" /> Buat purchase order</DialogTitle><DialogDescription>Tambahkan item yang akan dibeli dari supplier.</DialogDescription></DialogHeader><div className="space-y-4 py-5"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Supplier</Label><Select value={supplierId} onValueChange={setSupplierId}><SelectTrigger><SelectValue placeholder="Pilih supplier" /></SelectTrigger><SelectContent>{suppliers.data.filter((item) => item.is_active).map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Expected date</Label><Input type="date" value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)} /></div></div><div className="space-y-3"><div className="flex items-center justify-between"><Label>Item</Label><Button type="button" variant="outline" size="sm" onClick={() => setLines((current) => [...current, { variantId: "", quantity: "1", cost: "0" }])}><Plus /> Item</Button></div>{lines.map((line, index) => <div key={index} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_100px_140px_auto]"><Select value={line.variantId} onValueChange={(value) => { const variant = variants.data.find((item) => item.id === value); changeLine(index, { variantId: value, cost: variant?.cost_amount || "0" }) }}><SelectTrigger><SelectValue placeholder="Pilih produk" /></SelectTrigger><SelectContent>{variants.data.filter((item) => item.is_active).map((item) => <SelectItem key={item.id} value={item.id}>{variantNames.get(item.id)}</SelectItem>)}</SelectContent></Select><Input type="number" min="1" value={line.quantity} onChange={(event) => changeLine(index, { quantity: event.target.value })} placeholder="Qty" /><Input type="number" min="0" value={line.cost} onChange={(event) => changeLine(index, { cost: event.target.value })} placeholder="Harga beli" /><Button type="button" variant="ghost" onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))} disabled={lines.length === 1}>×</Button></div>)}</div><div className="space-y-2"><Label>Catatan</Label><Input value={notes} onChange={(event) => setNotes(event.target.value)} /></div></div><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button><Button className="bg-emerald-600 hover:bg-emerald-700" disabled={saving || !supplierId}>{saving && <Loader2 className="animate-spin" />} Buat PO</Button></DialogFooter></form></DialogContent></Dialog><Dialog open={Boolean(detail)} onOpenChange={(value) => !value && setDetail(undefined)}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>Detail purchase order</DialogTitle><DialogDescription>Item dan progres penerimaan.</DialogDescription></DialogHeader>{detail && <Table><TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Qty</TableHead><TableHead>Diterima</TableHead><TableHead>Harga</TableHead><TableHead>Total</TableHead></TableRow></TableHeader><TableBody>{detail.items.map((item) => <TableRow key={item.id}><TableCell>{item.sku}</TableCell><TableCell>{item.quantity}</TableCell><TableCell>{item.receivedQuantity || item.received_quantity || "0"}</TableCell><TableCell>{rupiah(item.unitCostAmount || item.unit_cost_amount || 0)}</TableCell><TableCell>{rupiah(item.totalAmount || item.total_amount || 0)}</TableCell></TableRow>)}</TableBody></Table>}<DialogFooter>{detail && !["received", "cancelled"].includes(detail.order.status) && <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => void receiveAll()} disabled={saving}>{saving && <Loader2 className="animate-spin" />} Terima semua outstanding</Button>}</DialogFooter></DialogContent></Dialog></div>
}
