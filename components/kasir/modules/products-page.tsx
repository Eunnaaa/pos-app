"use client"

import { useMemo, useState } from "react"
import { Download, FileSpreadsheet, Image as ImageIcon, Layers, Loader2, PackagePlus, Pencil, Plus, Search, Trash2, Upload, X } from "lucide-react"
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
import { getCategoryEmoji, getCategoryColor } from "@/lib/services/category-images"

type Product = {
  id: string
  name: string
  slug: string
  sku?: string
  type: string
  image_url?: string | null
  imageUrl?: string | null
  track_stock: boolean
  is_active: boolean
  created_at: string
  category_id?: string
  category_name?: string
}
type Variant = { id: string; product_id: string; name: string; sku: string; barcode?: string; cost_amount: string; price_amount: string; is_active: boolean }
type Category = { id: string; name: string; slug: string; sort_order: number }

export type VariantItemForm = {
  id?: string
  name: string
  sku: string
  barcode?: string
  cost: string
  price: string
  stock: string
}

type FormState = {
  name: string
  sku: string
  barcode: string
  cost: string
  price: string
  stock: string
  trackStock: boolean
  active: boolean
  categoryId: string
  imageUrl: string
  hasVariants: boolean
  variantsList: VariantItemForm[]
}
const empty: FormState = {
  name: "",
  sku: "",
  barcode: "",
  cost: "0",
  price: "0",
  stock: "0",
  trackStock: true,
  active: true,
  categoryId: "",
  imageUrl: "",
  hasVariants: false,
  variantsList: [],
}
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
  const [editing, setEditing] = useState<{ product: Product; variant?: Variant; allVariants?: Variant[] }>()
  const [form, setForm] = useState<FormState>(empty)
  const [importOpen, setImportOpen] = useState(false)
  const [csvText, setCsvText] = useState("")
  const [importing, setImporting] = useState(false)

  const rows = useMemo(
    () =>
      products.data
        .map((product) => {
          const productVariants = variants.data.filter((item) => item.product_id === product.id)
          const primaryVariant = productVariants[0]
          return { product, variant: primaryVariant, allVariants: productVariants }
        })
        .filter(
          ({ product, allVariants }) =>
            `${product.name} ${allVariants.map((v) => `${v.sku} ${v.barcode || ""}`).join(" ")}`.toLowerCase().includes(search.toLowerCase())
        ),
    [products.data, variants.data, search]
  )

  function showCreate() {
    setEditing(undefined)
    setForm({
      ...empty,
      hasVariants: false,
      variantsList: [],
    })
    setOpen(true)
  }

  function showEdit(product: Product, allVariants: Variant[] = []) {
    const categoryId = product.category_id || "none"
    const img = product.image_url || product.imageUrl || ""
    const primary = allVariants[0]
    const hasMultiple = allVariants.length > 1 || (allVariants.length === 1 && allVariants[0].name !== "Default")

    setEditing({ product, variant: primary, allVariants })
    setForm({
      name: product.name,
      sku: primary?.sku || product.sku || "",
      barcode: primary?.barcode || "",
      cost: primary?.cost_amount || "0",
      price: primary?.price_amount || "0",
      stock: "0",
      trackStock: product.track_stock,
      active: product.is_active,
      categoryId,
      imageUrl: img,
      hasVariants: hasMultiple,
      variantsList: hasMultiple
        ? allVariants.map((v) => ({
            id: v.id,
            name: v.name,
            sku: v.sku,
            barcode: v.barcode || "",
            cost: v.cost_amount || "0",
            price: v.price_amount || "0",
            stock: "0",
          }))
        : [],
    })
    setOpen(true)
  }

  const update = (field: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [field]: event.target.value }))
  const updateSelect = (field: keyof FormState) => (value: string) =>
    setForm((current) => ({ ...current, [field]: value }))

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      if (!form.sku.trim()) throw new Error("SKU produk wajib diisi")
      if (form.hasVariants && form.variantsList.length === 0) {
        throw new Error("Tambahkan minimal 1 varian atau matikan opsi varian")
      }
      for (const v of form.variantsList) {
        if (!v.name.trim()) throw new Error("Nama semua varian wajib diisi")
        if (!v.sku.trim()) throw new Error(`SKU untuk varian "${v.name}" wajib diisi`)
      }

      const categoryId = form.categoryId === "none" ? null : form.categoryId || null
      const imageUrl = form.imageUrl.trim() ? form.imageUrl.trim() : null

      if (editing) {
        await products.update(editing.product.id, {
          name: form.name,
          slug: slugify(form.name),
          sku: form.sku,
          trackStock: form.trackStock,
          isActive: form.active,
          categoryId,
          imageUrl,
        })

        if (form.hasVariants && form.variantsList.length > 0) {
          for (let i = 0; i < form.variantsList.length; i++) {
            const v = form.variantsList[i]
            if (v.id) {
              await variants.update(v.id, {
                name: v.name.trim(),
                sku: v.sku.trim(),
                barcode: v.barcode || null,
                costAmount: v.cost || form.cost,
                priceAmount: v.price || form.price,
                isActive: form.active,
              })
            } else {
              await variants.create({
                productId: editing.product.id,
                name: v.name.trim(),
                sku: v.sku.trim(),
                barcode: v.barcode || null,
                costAmount: v.cost || form.cost,
                priceAmount: v.price || form.price,
                isDefault: i === 0,
                isActive: form.active,
              })
            }
          }
        } else {
          if (editing.variant) {
            await variants.update(editing.variant.id, {
              name: "Default",
              sku: form.sku,
              barcode: form.barcode || null,
              costAmount: form.cost,
              priceAmount: form.price,
              isActive: form.active,
            })
          } else {
            await variants.create({
              productId: editing.product.id,
              name: "Default",
              sku: form.sku,
              barcode: form.barcode || null,
              costAmount: form.cost,
              priceAmount: form.price,
              isDefault: true,
              isActive: form.active,
            })
          }
        }
        showSuccess("Produk diperbarui")
      } else {
        const productResponse = await products.create({
          name: form.name,
          slug: slugify(form.name),
          sku: form.sku,
          type: "standard",
          trackStock: form.trackStock,
          isActive: form.active,
          categoryId,
          imageUrl,
        })
        if (productResponse.queued || !productResponse.data?.id)
          throw new Error("Pembuatan produk perlu koneksi internet")

        const newProductId = productResponse.data.id

        if (form.hasVariants && form.variantsList.length > 0) {
          for (let i = 0; i < form.variantsList.length; i++) {
            const v = form.variantsList[i]
            const variantResponse = await variants.create({
              productId: newProductId,
              name: v.name.trim(),
              sku: v.sku.trim(),
              barcode: v.barcode || null,
              costAmount: v.cost || form.cost,
              priceAmount: v.price || form.price,
              isDefault: i === 0,
              isActive: form.active,
            })

            if (Number(v.stock) > 0 && variantResponse.data?.id && warehouse?.id) {
              await apiFetch("/api/v1/inventory/adjustments", {
                method: "POST",
                queueOffline: true,
                body: JSON.stringify({
                  branchId: branch?.id,
                  warehouseId: warehouse.id,
                  variantId: variantResponse.data.id,
                  quantity: v.stock,
                  reason: `Stok awal varian ${v.name}`,
                }),
              })
            }
          }
        } else {
          const variantResponse = await variants.create({
            productId: newProductId,
            name: "Default",
            sku: form.sku,
            barcode: form.barcode || null,
            costAmount: form.cost,
            priceAmount: form.price,
            isDefault: true,
            isActive: form.active,
          })
          if (Number(form.stock) > 0 && variantResponse.data?.id && warehouse?.id) {
            await apiFetch("/api/v1/inventory/adjustments", {
              method: "POST",
              queueOffline: true,
              body: JSON.stringify({
                branchId: branch?.id,
                warehouseId: warehouse.id,
                variantId: variantResponse.data.id,
                quantity: form.stock,
                reason: "Stok awal produk",
              }),
            })
          }
        }
        showSuccess("Produk ditambahkan")
      }
      setOpen(false)
      await Promise.all([products.refresh(), variants.refresh()])
    } catch (caught) {
      showError(caught instanceof Error ? caught.message : "Gagal menyimpan produk")
    } finally {
      setSaving(false)
    }
  }

  async function remove(product: Product) {
    if (!confirm(`Hapus ${product.name}?`)) return
    try {
      await products.remove(product.id)
      showSuccess("Produk dihapus")
    } catch (caught) {
      showError(caught instanceof Error ? caught.message : "Gagal menghapus produk")
    }
  }

  function exportCSV() {
    window.open("/api/v1/products/export?format=csv", "_blank")
  }

  function downloadTemplate() {
    const template =
      "name,sku,barcode,price,cost,description,track_stock,is_active\nKopi Susu,SKU-001,8990001234567,25000,15000,,true,true\nCroissant,SKU-002,,20000,10000,Pastry butter,true,true"
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
      const response = await apiFetch<{ created: number; errors: string[] }>("/api/v1/products/import", {
        method: "POST",
        body: JSON.stringify({ csv: csvText }),
      })
      if (response.data.errors.length)
        showError(`${response.data.created} produk dibuat, ${response.data.errors.length} baris gagal`, {
          error: response.data.errors,
        })
      else showSuccess(`${response.data.created} produk berhasil diimpor`)
      setCsvText("")
      setImportOpen(false)
      await Promise.all([products.refresh(), variants.refresh()])
    } catch (error) {
      showError(error instanceof Error ? error.message : "Gagal mengimpor produk")
    } finally {
      setImporting(false)
    }
  }

  const loading = products.loading || variants.loading
  const activeCategories = categories.data.filter((c) => c.name)

  return (
    <div className="flex flex-1 flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Produk</h2>
          <p className="text-sm text-muted-foreground">Data produk, foto katalog, dan varian langsung dari database.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="size-4" /> Export CSV
          </Button>
          {isOwner && (
            <>
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                <Upload className="size-4" /> Import CSV
              </Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={showCreate}>
                <Plus /> Tambah produk
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Total produk</p>
            <p className="mt-2 text-2xl font-bold">{products.data.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Varian aktif</p>
            <p className="mt-2 text-2xl font-bold">{variants.data.filter((item) => item.is_active).length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Nilai harga katalog</p>
            <p className="mt-2 text-2xl font-bold">
              {rupiah(variants.data.reduce((sum, item) => sum + Number(item.price_amount), 0))}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Katalog</CardTitle>
              <CardDescription>Produk, foto, SKU, barcode, harga, dan status.</CardDescription>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari produk/SKU/barcode"
                className="pl-9 sm:w-72"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produk</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Barcode</TableHead>
                  <TableHead>Harga</TableHead>
                  {isOwner && <TableHead>HPP</TableHead>}
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={isOwner ? 8 : 7} className="h-32 text-center">
                      <Loader2 className="mx-auto animate-spin" />
                    </TableCell>
                  </TableRow>
                )}
                {!loading && !rows.length && (
                  <TableRow>
                    <TableCell colSpan={isOwner ? 8 : 7} className="h-32 text-center text-muted-foreground">
                      Belum ada produk. Tambahkan produk pertama.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map(({ product, variant, allVariants }) => {
                  const img = product.image_url || product.imageUrl
                  const hasMulti = allVariants.length > 1 || (allVariants.length === 1 && allVariants[0].name !== "Default")
                  const prices = allVariants.map((v) => Number(v.price_amount || 0)).filter((n) => !isNaN(n))
                  const minPrice = prices.length ? Math.min(...prices) : Number(variant?.price_amount || 0)
                  const maxPrice = prices.length ? Math.max(...prices) : Number(variant?.price_amount || 0)

                  return (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-3">
                          <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
                            {img ? (
                              <img src={img} alt={product.name} className="h-full w-full object-cover" />
                            ) : (
                              <div className={`flex size-full items-center justify-center text-lg ${getCategoryColor(product.category_name, product.name)}`}>
                                {getCategoryEmoji(product.category_name, product.name)}
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="font-semibold text-sm">{product.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {hasMulti ? (
                                <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                                  <Layers className="size-3" /> {allVariants.map((v) => v.name).join(" • ")}
                                </span>
                              ) : (
                                variant?.sku || product.sku || "—"
                              )}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{product.category_name || "—"}</TableCell>
                      <TableCell>
                        {hasMulti ? (
                          <Badge variant="outline" className="text-xs border-emerald-300 font-semibold text-emerald-700 dark:text-emerald-300">
                            {allVariants.length} Varian
                          </Badge>
                        ) : (
                          variant?.sku || product.sku || "—"
                        )}
                      </TableCell>
                      <TableCell>{variant?.barcode || "—"}</TableCell>
                      <TableCell className="font-semibold">
                        {hasMulti && minPrice !== maxPrice
                          ? `${rupiah(minPrice)} – ${rupiah(maxPrice)}`
                          : rupiah(minPrice)}
                      </TableCell>
                      {isOwner && <TableCell>{rupiah(variant?.cost_amount || 0)}</TableCell>}
                      <TableCell>
                        <Badge
                          className={product.is_active ? "bg-emerald-600" : ""}
                          variant={product.is_active ? "default" : "outline"}
                        >
                          {product.is_active ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {isOwner && (
                            <>
                              <Button variant="ghost" size="icon" onClick={() => showEdit(product, allVariants)}>
                                <Pencil className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive"
                                onClick={() => void remove(product)}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <form onSubmit={save}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <PackagePlus className="text-emerald-600" />
                {editing ? "Edit produk" : "Tambah produk"}
              </DialogTitle>
              <DialogDescription>Kelola detail produk, foto, harga, dan opsi varian.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Nama produk</Label>
                <Input value={form.name} onChange={update("name")} placeholder="Contoh: Matcha Latte, Kopi Susu" required />
              </div>

              {/* Foto Produk Opsional */}
              <div className="space-y-2 sm:col-span-2">
                <Label>Foto Produk (Opsional)</Label>
                <div className="flex items-center gap-4 rounded-xl border p-3 bg-muted/20">
                  <div className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-background">
                    {form.imageUrl ? (
                      <img src={form.imageUrl} alt="Preview" className="h-full w-full object-cover" />
                    ) : (
                      <div className={`flex size-full items-center justify-center text-2xl ${getCategoryColor(activeCategories.find((c) => c.id === form.categoryId)?.name, form.name)}`}>
                        {getCategoryEmoji(activeCategories.find((c) => c.id === form.categoryId)?.name, form.name)}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="cursor-pointer">
                        <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1.5 rounded-lg" asChild>
                          <span>
                            <Upload className="size-3.5" /> Pilih Foto
                          </span>
                        </Button>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            if (file.size > 3 * 1024 * 1024) {
                              showError("Ukuran foto maksimal 3MB")
                              return
                            }
                            const reader = new FileReader()
                            reader.onload = (evt) => {
                              if (typeof evt.target?.result === "string") {
                                setForm((c) => ({ ...c, imageUrl: evt.target!.result as string }))
                              }
                            }
                            reader.readAsDataURL(file)
                          }}
                        />
                      </label>
                      {form.imageUrl && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs text-destructive hover:bg-destructive/10 rounded-lg gap-1"
                          onClick={() => setForm((c) => ({ ...c, imageUrl: "" }))}
                        >
                          <X className="size-3.5" /> Hapus Foto
                        </Button>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      JPG, PNG, atau WebP (Maks. 3MB). Jika dikosongkan, produk akan otomatis menggunakan visual default.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>SKU Induk / Utama</Label>
                <Input value={form.sku} onChange={update("sku")} placeholder="MTC-001" required />
              </div>

              <div className="space-y-2">
                <Label>Kategori</Label>
                <Select value={form.categoryId} onValueChange={updateSelect("categoryId")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih kategori (opsional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Tanpa kategori —</SelectItem>
                    {activeCategories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Multi-Variant Section */}
              <div className="space-y-3 sm:col-span-2 border rounded-2xl p-4 bg-muted/20">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-bold flex items-center gap-1.5 text-foreground cursor-pointer" htmlFor="toggle-variants">
                      <Layers className="size-4 text-emerald-600" /> Memiliki Opsi Varian (Hot / Ice, Ukuran, dll.)
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      Aktifkan jika produk memiliki pilihan Hot/Ice atau ukuran berbeda dengan harga masing-masing.
                    </p>
                  </div>
                  <Switch
                    id="toggle-variants"
                    checked={form.hasVariants}
                    onCheckedChange={(checked) => {
                      setForm((c) => {
                        if (checked && c.variantsList.length === 0) {
                          const baseSku = c.sku.trim() || "SKU"
                          const basePrice = c.price || "0"
                          const baseCost = c.cost || "0"
                          return {
                            ...c,
                            hasVariants: true,
                            variantsList: [
                              { name: "Hot", sku: `${baseSku}-HOT`, price: basePrice, cost: baseCost, stock: "0" },
                              { name: "Iced", sku: `${baseSku}-ICE`, price: String(Number(basePrice) > 0 ? Number(basePrice) + 3000 : "0"), cost: baseCost, stock: "0" },
                            ],
                          }
                        }
                        return { ...c, hasVariants: checked }
                      })
                    }}
                  />
                </div>

                {form.hasVariants && (
                  <div className="space-y-3 pt-2">
                    {/* Preset quick buttons */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground">Preset:</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs rounded-lg gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                        onClick={() => {
                          const baseSku = form.sku.trim() || "SKU"
                          const basePrice = form.price || "0"
                          const baseCost = form.cost || "0"
                          setForm((c) => ({
                            ...c,
                            variantsList: [
                              { name: "Hot", sku: `${baseSku}-HOT`, price: basePrice, cost: baseCost, stock: "0" },
                              { name: "Iced", sku: `${baseSku}-ICE`, price: String(Number(basePrice) > 0 ? Number(basePrice) + 3000 : "0"), cost: baseCost, stock: "0" },
                            ],
                          }))
                        }}
                      >
                        ☕ 🧊 Preset Hot &amp; Ice
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs rounded-lg gap-1 border-blue-500/40 text-blue-700 dark:text-blue-300"
                        onClick={() => {
                          const baseSku = form.sku.trim() || "SKU"
                          const basePrice = form.price || "0"
                          const baseCost = form.cost || "0"
                          setForm((c) => ({
                            ...c,
                            variantsList: [
                              { name: "Regular", sku: `${baseSku}-REG`, price: basePrice, cost: baseCost, stock: "0" },
                              { name: "Large", sku: `${baseSku}-LRG`, price: String(Number(basePrice) > 0 ? Number(basePrice) + 5000 : "0"), cost: baseCost, stock: "0" },
                            ],
                          }))
                        }}
                      >
                        📏 Preset Ukuran (Reg / Large)
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs rounded-lg gap-1"
                        onClick={() => {
                          const baseSku = form.sku.trim() || "SKU"
                          setForm((c) => ({
                            ...c,
                            variantsList: [
                              ...c.variantsList,
                              { name: "", sku: `${baseSku}-${c.variantsList.length + 1}`, price: c.price || "0", cost: c.cost || "0", stock: "0" },
                            ],
                          }))
                        }}
                      >
                        <Plus className="size-3" /> Tambah Baris
                      </Button>
                    </div>

                    {/* Variants Input List */}
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {form.variantsList.map((vItem, idx) => (
                        <div key={idx} className="flex flex-wrap sm:flex-nowrap items-center gap-2 rounded-xl border bg-background p-2.5 shadow-2xs text-xs">
                          <div className="w-28 space-y-1">
                            <Label className="text-[10px] font-semibold text-muted-foreground">Nama Varian</Label>
                            <Input
                              placeholder="Hot / Iced"
                              value={vItem.name}
                              onChange={(e) => {
                                const val = e.target.value
                                setForm((c) => ({
                                  ...c,
                                  variantsList: c.variantsList.map((item, i) => (i === idx ? { ...item, name: val } : item)),
                                }))
                              }}
                              className="h-8 text-xs font-semibold"
                              required
                            />
                          </div>

                          <div className="w-28 space-y-1">
                            <Label className="text-[10px] font-semibold text-muted-foreground">SKU Varian</Label>
                            <Input
                              placeholder="MTC-HOT"
                              value={vItem.sku}
                              onChange={(e) => {
                                const val = e.target.value
                                setForm((c) => ({
                                  ...c,
                                  variantsList: c.variantsList.map((item, i) => (i === idx ? { ...item, sku: val } : item)),
                                }))
                              }}
                              className="h-8 text-xs"
                              required
                            />
                          </div>

                          <div className="flex-1 min-w-24 space-y-1">
                            <Label className="text-[10px] font-semibold text-muted-foreground">Harga Jual (Rp)</Label>
                            <Input
                              type="number"
                              min="0"
                              placeholder="22000"
                              value={vItem.price}
                              onChange={(e) => {
                                const val = e.target.value
                                setForm((c) => ({
                                  ...c,
                                  variantsList: c.variantsList.map((item, i) => (i === idx ? { ...item, price: val } : item)),
                                }))
                              }}
                              className="h-8 text-xs font-bold text-emerald-600"
                              required
                            />
                          </div>

                          {isOwner && (
                            <div className="w-24 space-y-1">
                              <Label className="text-[10px] font-semibold text-muted-foreground">HPP (Rp)</Label>
                              <Input
                                type="number"
                                min="0"
                                placeholder="10000"
                                value={vItem.cost}
                                onChange={(e) => {
                                  const val = e.target.value
                                  setForm((c) => ({
                                    ...c,
                                    variantsList: c.variantsList.map((item, i) => (i === idx ? { ...item, cost: val } : item)),
                                  }))
                                }}
                                className="h-8 text-xs"
                              />
                            </div>
                          )}

                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 mt-4 text-destructive hover:bg-destructive/10 shrink-0"
                            onClick={() => {
                              setForm((c) => ({
                                ...c,
                                variantsList: c.variantsList.filter((_, i) => i !== idx),
                              }))
                            }}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {!form.hasVariants && (
                <>
                  <div className="space-y-2">
                    <Label>Barcode (Opsional)</Label>
                    <Input value={form.barcode} onChange={update("barcode")} placeholder="Opsional barcode" />
                  </div>
                  <div className="space-y-2">
                    <Label>Harga jual</Label>
                    <Input type="number" min="0" value={form.price} onChange={update("price")} required />
                  </div>
                  {isOwner && (
                    <div className="space-y-2">
                      <Label>Harga pokok (HPP)</Label>
                      <Input type="number" min="0" value={form.cost} onChange={update("cost")} required />
                    </div>
                  )}
                  {!editing && (
                    <div className="space-y-2">
                      <Label>Stok awal</Label>
                      <Input
                        type="number"
                        min="0"
                        value={form.stock}
                        onChange={update("stock")}
                        disabled={!form.trackStock}
                      />
                    </div>
                  )}
                </>
              )}

              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label>Lacak stok</Label>
                <Switch
                  checked={form.trackStock}
                  onCheckedChange={(value) => setForm((current) => ({ ...current, trackStock: value }))}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label>Produk aktif</Label>
                <Switch
                  checked={form.active}
                  onCheckedChange={(value) => setForm((current) => ({ ...current, active: value }))}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Batal
              </Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={saving}>
                {saving && <Loader2 className="animate-spin" />}
                {saving ? "Menyimpan..." : "Simpan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="text-emerald-600" /> Import Produk dari CSV
            </DialogTitle>
            <DialogDescription>
              Pilih berkas CSV atau tempelkan data. Format: name,sku,barcode,price,cost,description,track_stock,is_active
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex-1">
                <Label className="text-xs font-medium">Unggah Berkas .CSV</Label>
                <Input
                  type="file"
                  accept=".csv"
                  className="mt-1 h-9 text-xs"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const reader = new FileReader()
                    reader.onload = (evt) => {
                      if (typeof evt.target?.result === "string") {
                        setCsvText(evt.target.result)
                      }
                    }
                    reader.readAsText(file)
                  }}
                />
              </div>
              <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" onClick={downloadTemplate}>
                <Download className="size-4" /> Download Template
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Atau tempelkan isi teks CSV di bawah ini:</p>
            <textarea
              className="min-h-[160px] w-full rounded-lg border p-3 font-mono text-xs"
              placeholder={
                "name,sku,barcode,price,cost,description,track_stock,is_active\nKopi Susu,SKU-001,8990001234567,25000,15000,,true,true\nCroissant,SKU-002,,20000,10000,Pastry,true,true"
              }
              value={csvText}
              onChange={(event) => setCsvText(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setImportOpen(false)}>
              Batal
            </Button>
            <Button
              type="button"
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={importing || !csvText.trim()}
              onClick={() => void handleImport()}
            >
              {importing ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Mengimpor...
                </>
              ) : (
                <>
                  <Upload className="size-4" /> Import
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}