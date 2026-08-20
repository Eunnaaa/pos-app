"use client"

import { useMemo, useState } from "react"
import { Download, FileSpreadsheet, Loader2, PackagePlus, Pencil, Plus, Search, Trash2, Upload } from "lucide-react"
import { showError, showSuccess } from "@/lib/toast-handler"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type Product = { id: string; name: string; slug: string; sku?: string; type: string; track_stock: boolean; is_active: boolean; created_at: string; category_id?: string; category_name?: string }
type Variant = { id: string; product_id: string; name: string; sku: string; barcode?: string; cost_amount: string; price_amount: string; is_active: boolean }
type Category = { id: string; name: string; slug: string; sort_order: number }

type FormState = { name: string; sku: string; barcode: string; cost: string; price: string; stock: string; trackStock: boolean; active: boolean; categoryId: string }
const empty: FormState = { name: "", sku: "", barcode: "", cost: "0", price: "0", stock: "0", trackStock: true, active: true, categoryId: "" }
const rupiah = (value: string | number) => `Rp ${Number(value).toLocaleString("id-ID")}`
const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

export function ProductsPage() {
  const products = useResource<Product>("products", "limit=100")
  const variants = useResource<Variant>("variants", "limit=100")
  const categories = useResource<Category>("categories", "limit=100")
  const { branch, warehouse, organization } = useOrganization()
  const isOwner = organization?.role === "owner"
  const [search, setSearch] = useState("")
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<{ product: Product; variant?: Variant }>()
  const [form, setForm] = useState<FormState>(empty)
  const [importOpen, setImportOpen] = useState(false)
  const [csvText, setCsvText] = useState("")
  const [importing, setImporting] = useState(false)

  const rows = useMemo(() => products.data.map((product) => ({ product, variant: variants.data.find((item) => item.product_id === product.id) })).filter(({ product, variant }) => `${product.name} ${variant?.sku || ""} ${variant?.barcode || ""}`.toLowerCase().includes(search.toLowerCase())), [products.data, variants.data, search])

  function showCreate() { setEditing(undefined); setForm(empty); setOpen(true) }
  function showEdit(product: Product, variant?: Variant) {
    const categoryId = product.category_id || "none"
    setEditing({ product, variant }); setForm({ name: product.name, sku: variant?.sku || product.sku || "", barcode: variant?.barcode || "", cost: variant?.cost_amount || "0", price: variant?.price_amount || "0", stock: "0", trackStock: product.track_stock, active: product.is_active, categoryId }); setOpen(true)
  }
  const update = (field: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, [field]: event.target.value }))
  const updateSelect = (field: keyof FormState) => (value: string) => setForm((current) => ({ ...current, [field]: value }))

  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true)
    try {
      if (!form.sku.trim()) throw new Error("SKU wajib diisi")
      const categoryId = form.categoryId === "none" ? null : (form.categoryId || null)
      if (editing) {
        await products.update(editing.product.id, { name: form.name, slug: slugify(form.name), sku: form.sku, trackStock: form.trackStock, isActive: form.active, categoryId })
        if (editing.variant) await variants.update(editing.variant.id, { name: "Default", sku: form.sku, barcode: form.barcode || null, costAmount: form.cost, priceAmount: form.price, isActive: form.active })
        else await variants.create({ productId: editing.product.id, name: "Default", sku: form.sku, barcode: form.barcode || null, costAmount: form.cost, priceAmount: form.price, isDefault: true, isActive: form.active })
        showSuccess("Produk diperbarui")
      } else {
        const categoryId = form.categoryId === "none" ? null : (form.categoryId || null)
        const productResponse = await products.create({ name: form.name, slug: slugify(form.name), sku: form.sku, type: "standard", trackStock: form.trackStock, isActive: form.active, categoryId })
        if (productResponse.queued || !productResponse.data?.id) throw new Error("Pembuatan produk perlu koneksi internet")
        const variantResponse = await variants.create({ productId: productResponse.data.id, name: "Default", sku: form.sku, barcode: form.barcode || null, costAmount: form.cost, priceAmount: form.price, isDefault: true, isActive: form.active })
        if (Number(form.stock) > 0 && variantResponse.data?.id && warehouse?.id) {
          await apiFetch("/api/v1/inventory/adjustments", { method: "POST", queueOffline: true, body: JSON.stringify({ branchId: branch?.id, warehouseId: warehouse.id, variantId: variantResponse.data.id, quantity: form.stock, reason: "Stok awal produk" }) })
        }
        showSuccess("Produk ditambahkan")
      }
      setOpen(false); await Promise.all([products.refresh(), variants.refresh()])
    } catch (caught) { showError(caught instanceof Error ? caught.message : "Gagal menyimpan produk") }
    finally { setSaving(false) }
  }

  async function remove(product: Product) {
    if (!confirm(`Hapus ${product.name}?`)) return
    try { await products.remove(product.id); showSuccess("Produk dihapus") } catch (caught) { showError(caught instanceof Error ? caught.message : "Gagal menghapus produk") }
  }

  function exportCSV() {
    window.open("/api/v1/products/export?format=csv", "_blank")
  }

  function downloadTemplate() {
    const template = "name,sku,barcode,price,cost,description,track_stock,is_active\nKopi Susu,SKU-001,8990001234567,25000,15000,,true,true\nCroissant,SKU-002,,20000,10000,Pastry butter,true,true"
    const blob = new Blob([template], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "product-import-template.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImport() {
    if (!csvText.trim()) return
    setImporting(true)
    try {
      const response = await apiFetch<{ created: number; errors: string[] }>("/api/v1/products/import", { method: "POST", body: JSON.stringify({ csv: csvText }) })
      if (response.data.errors.length) showError(`${response.data.created} produk dibuat, ${response.data.errors.length} baris gagal`, { error: response.data.errors })
      else showSuccess(`${response.data.created} produk berhasil diimpor`)
      setCsvText(""); setImportOpen(false)
      await Promise.all([products.refresh(), variants.refresh()])
    } catch (error) {
      showError(error instanceof Error ? error.message : "Gagal mengimpor produk")
    } finally {
      setImporting(false)
    }
  }

  const loading = products.loading || variants.loading
  const activeCategories = categories.data.filter((c) => c.name)

  return <div className="flex flex-1 flex-col gap-5 p-4 md:p-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-2xl font-bold">Produk</h2><p className="text-sm text-muted-foreground">Data produk dan varian langsung dari database.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={exportCSV}><Download className="size-4" /> Export CSV</Button>{isOwner && <><Button variant="outline" size="sm" onClick={() => setImportOpen(true)}><Upload className="size-4" /> Import CSV</Button><Button className="bg-emerald-600 hover:bg-emerald-700" onClick={showCreate}><Plus /> Tambah produk</Button></>}</div></div>
    <div className="grid gap-3 sm:grid-cols-3"><Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Total produk</p><p className="mt-2 text-2xl font-bold">{products.data.length}</p></CardContent></Card><Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Varian aktif</p><p className="mt-2 text-2xl font-bold">{variants.data.filter((item) => item.is_active).length}</p></CardContent></Card><Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Nilai harga katalog</p><p className="mt-2 text-2xl font-bold">{rupiah(variants.data.reduce((sum, item) => sum + Number(item.price_amount), 0))}</p></CardContent></Card></div>
    <Card><CardHeader className="border-b"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle>Katalog</CardTitle><CardDescription>Produk, SKU, barcode, harga, dan status.</CardDescription></div><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari produk/SKU/barcode" className="pl-9 sm:w-72" /></div></div></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Produk</TableHead><TableHead>Kategori</TableHead><TableHead>SKU</TableHead><TableHead>Barcode</TableHead><TableHead>Harga</TableHead>{isOwner && <TableHead>HPP</TableHead>}<TableHead>Status</TableHead><TableHead /></TableRow></TableHeader><TableBody>{loading && <TableRow><TableCell colSpan={isOwner ? 8 : 7} className="h-32 text-center"><Loader2 className="mx-auto animate-spin" /></TableCell></TableRow>}{!loading && !rows.length && <TableRow><TableCell colSpan={isOwner ? 8 : 7} className="h-32 text-center text-muted-foreground">Belum ada produk. Tambahkan produk pertama.</TableCell></TableRow>}{rows.map(({ product, variant }) => <TableRow key={product.id}><TableCell className="font-medium">{product.name}</TableCell><TableCell>{product.category_name || "—"}</TableCell><TableCell>{variant?.sku || product.sku || "—"}</TableCell><TableCell>{variant?.barcode || "—"}</TableCell><TableCell>{rupiah(variant?.price_amount || 0)}</TableCell>{isOwner && <TableCell>{rupiah(variant?.cost_amount || 0)}</TableCell>}<TableCell><Badge className={product.is_active ? "bg-emerald-600" : ""} variant={product.is_active ? "default" : "outline"}>{product.is_active ? "Aktif" : "Nonaktif"}</Badge></TableCell><TableCell><div className="flex justify-end gap-1">{isOwner && <><Button variant="ghost" size="icon" onClick={() => showEdit(product, variant)}><Pencil className="size-4" /></Button><Button variant="ghost" size="icon" className="text-destructive" onClick={() => void remove(product)}><Trash2 className="size-4" /></Button></>}</div></TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-xl"><form onSubmit={save}><DialogHeader><DialogTitle className="flex items-center gap-2"><PackagePlus className="text-emerald-600" />{editing ? "Edit produk" : "Tambah produk"}</DialogTitle><DialogDescription>Produk dibuat bersama varian default agar langsung dapat dijual.</DialogDescription></DialogHeader><div className="grid gap-4 py-5 sm:grid-cols-2"><div className="space-y-2 sm:col-span-2"><Label>Nama produk</Label><Input value={form.name} onChange={update("name")} required /></div><div className="space-y-2"><Label>SKU</Label><Input value={form.sku} onChange={update("sku")} required /></div><div className="space-y-2"><Label>Barcode</Label><Input value={form.barcode} onChange={update("barcode")} /></div><div className="space-y-2"><Label>Harga jual</Label><Input type="number" min="0" value={form.price} onChange={update("price")} required /></div>{isOwner && <div className="space-y-2"><Label>Harga pokok (HPP)</Label><Input type="number" min="0" value={form.cost} onChange={update("cost")} required /></div>}{!editing && <div className="space-y-2"><Label>Stok awal</Label><Input type="number" min="0" value={form.stock} onChange={update("stock")} disabled={!form.trackStock} /></div>}<div className="space-y-2"><Label>Kategori</Label><Select value={form.categoryId} onValueChange={updateSelect("categoryId")}><SelectTrigger><SelectValue placeholder="Pilih kategori (opsional)" /></SelectTrigger><SelectContent><SelectItem value="none">— Tanpa kategori —</SelectItem>{activeCategories.map((cat) => <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>)}</SelectContent></Select></div><div className="flex items-center justify-between rounded-lg border p-3"><Label>Lacak stok</Label><Switch checked={form.trackStock} onCheckedChange={(value) => setForm((current) => ({ ...current, trackStock: value }))} /></div><div className="flex items-center justify-between rounded-lg border p-3"><Label>Produk aktif</Label><Switch checked={form.active} onCheckedChange={(value) => setForm((current) => ({ ...current, active: value }))} /></div></div><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button><Button className="bg-emerald-600 hover:bg-emerald-700" disabled={saving}>{saving && <Loader2 className="animate-spin" />}{saving ? "Menyimpan..." : "Simpan"}</Button></DialogFooter></form></DialogContent></Dialog>
    <Dialog open={importOpen} onOpenChange={setImportOpen}><DialogContent><DialogHeader><DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="text-emerald-600" /> Import Produk dari CSV</DialogTitle><DialogDescription>Pilih berkas CSV atau tempelkan data. Format: name,sku,barcode,price,cost,description,track_stock,is_active</DialogDescription></DialogHeader><div className="space-y-3 py-3"><div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div className="flex-1"><Label className="text-xs font-medium">Unggah Berkas .CSV</Label><Input type="file" accept=".csv" className="mt-1 h-9 text-xs" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = (evt) => { if (typeof evt.target?.result === "string") { setCsvText(evt.target.result) } }; reader.readAsText(file) }} /></div><Button type="button" variant="outline" size="sm" className="h-9 shrink-0" onClick={downloadTemplate}><Download className="size-4" /> Download Template</Button></div><p className="text-xs text-muted-foreground">Atau tempelkan isi teks CSV di bawah ini:</p><textarea className="min-h-[160px] w-full rounded-lg border p-3 font-mono text-xs" placeholder={"name,sku,barcode,price,cost,description,track_stock,is_active\nKopi Susu,SKU-001,8990001234567,25000,15000,,true,true\nCroissant,SKU-002,,20000,10000,Pastry,true,true"} value={csvText} onChange={(event) => setCsvText(event.target.value)} /></div><DialogFooter><Button type="button" variant="outline" onClick={() => setImportOpen(false)}>Batal</Button><Button type="button" className="bg-emerald-600 hover:bg-emerald-700" disabled={importing || !csvText.trim()} onClick={() => void handleImport()}>{importing ? <><Loader2 className="size-4 animate-spin" /> Mengimpor...</> : <><Upload className="size-4" /> Import</>}</Button></DialogFooter></DialogContent></Dialog>
  </div>
}