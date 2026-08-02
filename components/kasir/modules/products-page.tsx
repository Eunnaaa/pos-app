"use client"

import { useMemo, useState } from "react"
import { Loader2, PackagePlus, Pencil, Plus, Search, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useOrganization } from "@/components/kasir/organization-provider"
import { useResource } from "@/hooks/use-resource"
import { apiFetch } from "@/lib/client"

type Product = { id: string; name: string; slug: string; sku?: string; type: string; track_stock: boolean; is_active: boolean; created_at: string }
type Variant = { id: string; product_id: string; name: string; sku: string; barcode?: string; cost_amount: string; price_amount: string; is_active: boolean }

type FormState = { name: string; sku: string; barcode: string; cost: string; price: string; stock: string; trackStock: boolean; active: boolean }
const empty: FormState = { name: "", sku: "", barcode: "", cost: "0", price: "0", stock: "0", trackStock: true, active: true }
const rupiah = (value: string | number) => `Rp ${Number(value).toLocaleString("id-ID")}`
const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

export function ProductsPage() {
  const products = useResource<Product>("products", "limit=100")
  const variants = useResource<Variant>("variants", "limit=100")
  const { branch, warehouse } = useOrganization()
  const [search, setSearch] = useState("")
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<{ product: Product; variant?: Variant }>()
  const [form, setForm] = useState<FormState>(empty)

  const rows = useMemo(() => products.data.map((product) => ({ product, variant: variants.data.find((item) => item.product_id === product.id) })).filter(({ product, variant }) => `${product.name} ${variant?.sku || ""} ${variant?.barcode || ""}`.toLowerCase().includes(search.toLowerCase())), [products.data, variants.data, search])

  function showCreate() { setEditing(undefined); setForm(empty); setOpen(true) }
  function showEdit(product: Product, variant?: Variant) {
    setEditing({ product, variant }); setForm({ name: product.name, sku: variant?.sku || product.sku || "", barcode: variant?.barcode || "", cost: variant?.cost_amount || "0", price: variant?.price_amount || "0", stock: "0", trackStock: product.track_stock, active: product.is_active }); setOpen(true)
  }
  const update = (field: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, [field]: event.target.value }))

  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true)
    try {
      if (!form.sku.trim()) throw new Error("SKU wajib diisi")
      if (editing) {
        await products.update(editing.product.id, { name: form.name, slug: slugify(form.name), sku: form.sku, trackStock: form.trackStock, isActive: form.active })
        if (editing.variant) await variants.update(editing.variant.id, { name: "Default", sku: form.sku, barcode: form.barcode || null, costAmount: form.cost, priceAmount: form.price, isActive: form.active })
        else await variants.create({ productId: editing.product.id, name: "Default", sku: form.sku, barcode: form.barcode || null, costAmount: form.cost, priceAmount: form.price, isDefault: true, isActive: form.active })
        toast.success("Produk diperbarui")
      } else {
        const productResponse = await products.create({ name: form.name, slug: slugify(form.name), sku: form.sku, type: "standard", trackStock: form.trackStock, isActive: form.active })
        if (productResponse.queued || !productResponse.data?.id) throw new Error("Pembuatan produk perlu koneksi internet")
        const variantResponse = await variants.create({ productId: productResponse.data.id, name: "Default", sku: form.sku, barcode: form.barcode || null, costAmount: form.cost, priceAmount: form.price, isDefault: true, isActive: form.active })
        if (Number(form.stock) > 0 && variantResponse.data?.id && warehouse?.id) {
          await apiFetch("/api/v1/inventory/adjustments", { method: "POST", queueOffline: true, body: JSON.stringify({ branchId: branch?.id, warehouseId: warehouse.id, variantId: variantResponse.data.id, quantity: form.stock, reason: "Stok awal produk" }) })
        }
        toast.success("Produk ditambahkan")
      }
      setOpen(false); await Promise.all([products.refresh(), variants.refresh()])
    } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Gagal menyimpan produk") }
    finally { setSaving(false) }
  }

  async function remove(product: Product) {
    if (!confirm(`Hapus ${product.name}?`)) return
    try { await products.remove(product.id); toast.success("Produk dihapus") } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Gagal menghapus produk") }
  }

  const loading = products.loading || variants.loading
  return <div className="flex flex-1 flex-col gap-5 p-4 md:p-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-2xl font-bold">Produk</h2><p className="text-sm text-muted-foreground">Data produk dan varian langsung dari database.</p></div><Button className="bg-emerald-600 hover:bg-emerald-700" onClick={showCreate}><Plus /> Tambah produk</Button></div>
    <div className="grid gap-3 sm:grid-cols-3"><Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Total produk</p><p className="mt-2 text-2xl font-bold">{products.data.length}</p></CardContent></Card><Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Varian aktif</p><p className="mt-2 text-2xl font-bold">{variants.data.filter((item) => item.is_active).length}</p></CardContent></Card><Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Nilai harga katalog</p><p className="mt-2 text-2xl font-bold">{rupiah(variants.data.reduce((sum, item) => sum + Number(item.price_amount), 0))}</p></CardContent></Card></div>
    <Card><CardHeader className="border-b"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle>Katalog</CardTitle><CardDescription>Produk, SKU, barcode, harga, dan status.</CardDescription></div><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari produk/SKU/barcode" className="pl-9 sm:w-72" /></div></div></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Produk</TableHead><TableHead>SKU</TableHead><TableHead>Barcode</TableHead><TableHead>Harga</TableHead><TableHead>HPP</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader><TableBody>{loading && <TableRow><TableCell colSpan={7} className="h-32 text-center"><Loader2 className="mx-auto animate-spin" /></TableCell></TableRow>}{!loading && !rows.length && <TableRow><TableCell colSpan={7} className="h-32 text-center text-muted-foreground">Belum ada produk. Tambahkan produk pertama.</TableCell></TableRow>}{rows.map(({ product, variant }) => <TableRow key={product.id}><TableCell className="font-medium">{product.name}</TableCell><TableCell>{variant?.sku || product.sku || "—"}</TableCell><TableCell>{variant?.barcode || "—"}</TableCell><TableCell>{rupiah(variant?.price_amount || 0)}</TableCell><TableCell>{rupiah(variant?.cost_amount || 0)}</TableCell><TableCell><Badge className={product.is_active ? "bg-emerald-600" : ""} variant={product.is_active ? "default" : "outline"}>{product.is_active ? "Aktif" : "Nonaktif"}</Badge></TableCell><TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => showEdit(product, variant)}><Pencil className="size-4" /></Button><Button variant="ghost" size="icon" className="text-destructive" onClick={() => void remove(product)}><Trash2 className="size-4" /></Button></div></TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-xl"><form onSubmit={save}><DialogHeader><DialogTitle className="flex items-center gap-2"><PackagePlus className="text-emerald-600" />{editing ? "Edit produk" : "Tambah produk"}</DialogTitle><DialogDescription>Produk dibuat bersama varian default agar langsung dapat dijual.</DialogDescription></DialogHeader><div className="grid gap-4 py-5 sm:grid-cols-2"><div className="space-y-2 sm:col-span-2"><Label>Nama produk</Label><Input value={form.name} onChange={update("name")} required /></div><div className="space-y-2"><Label>SKU</Label><Input value={form.sku} onChange={update("sku")} required /></div><div className="space-y-2"><Label>Barcode</Label><Input value={form.barcode} onChange={update("barcode")} /></div><div className="space-y-2"><Label>Harga jual</Label><Input type="number" min="0" value={form.price} onChange={update("price")} required /></div><div className="space-y-2"><Label>Harga pokok</Label><Input type="number" min="0" value={form.cost} onChange={update("cost")} required /></div>{!editing && <div className="space-y-2"><Label>Stok awal</Label><Input type="number" min="0" value={form.stock} onChange={update("stock")} disabled={!form.trackStock} /></div>}<div className="flex items-center justify-between rounded-lg border p-3"><Label>Lacak stok</Label><Switch checked={form.trackStock} onCheckedChange={(value) => setForm((current) => ({ ...current, trackStock: value }))} /></div><div className="flex items-center justify-between rounded-lg border p-3"><Label>Produk aktif</Label><Switch checked={form.active} onCheckedChange={(value) => setForm((current) => ({ ...current, active: value }))} /></div></div><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button><Button className="bg-emerald-600 hover:bg-emerald-700" disabled={saving}>{saving && <Loader2 className="animate-spin" />}{saving ? "Menyimpan..." : "Simpan"}</Button></DialogFooter></form></DialogContent></Dialog>
  </div>
}
