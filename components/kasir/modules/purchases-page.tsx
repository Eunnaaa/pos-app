"use client"

import { useMemo, useState } from "react"
import {
  Banknote,
  CheckCircle2,
  Clock,
  Loader2,
  Plus,
  Search,
  Truck,
  X,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useOrganization } from "@/components/kasir/organization-provider"
import { useResource } from "@/hooks/use-resource"
import { apiFetch } from "@/lib/client"
import { showError, showInfo, showSuccess } from "@/lib/toast-handler"

type Supplier = { id: string; name: string; code: string; is_active: boolean }
type Product = { id: string; name: string }
type Variant = { id: string; product_id: string; name: string; sku: string; cost_amount: string; is_active: boolean }
type PurchaseOrder = {
  id: string
  order_number: string
  supplier_id: string
  warehouse_id: string
  status: string
  order_date: string
  expected_date?: string
  total_amount: string
  notes?: string
}
type PurchaseDetail = {
  order: { id: string; status: string; warehouseId?: string; warehouse_id?: string }
  items: {
    id: string
    variantId?: string
    variant_id?: string
    quantity: string
    receivedQuantity?: string
    received_quantity?: string
    unitCostAmount?: string
    unit_cost_amount?: string
    totalAmount?: string
    total_amount?: string
    sku: string
    variantName?: string
    variant_name?: string
  }[]
}
type Line = { variantId: string; quantity: string; cost: string }
const rupiah = (value: string | number) => `Rp ${Number(value).toLocaleString("id-ID")}`

function getStatusBadge(status: string) {
  switch (status) {
    case "received":
      return <Badge className="bg-emerald-600 hover:bg-emerald-700">Diterima Penuh</Badge>
    case "partial":
      return <Badge className="bg-blue-600 hover:bg-blue-700">Diterima Sebagian</Badge>
    case "submitted":
      return (
        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300">
          Menunggu Barang
        </Badge>
      )
    case "cancelled":
      return <Badge variant="secondary">Dibatalkan</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

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

  const supplierNames = useMemo(
    () => new Map(suppliers.data.map((item) => [item.id, item.name])),
    [suppliers.data],
  )
  const variantNames = useMemo(
    () =>
      new Map(
        variants.data.map((variant) => [
          variant.id,
          `${products.data.find((product) => product.id === variant.product_id)?.name || "Produk"}${variant.name === "Default" ? "" : ` - ${variant.name}`} (${variant.sku})`,
        ]),
      ),
    [variants.data, products.data],
  )

  const visible = orders.data.filter((order) =>
    `${order.order_number} ${supplierNames.get(order.supplier_id) || ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  )

  function reset() {
    setSupplierId("")
    setExpectedDate("")
    setNotes("")
    setLines([{ variantId: "", quantity: "1", cost: "0" }])
  }

  function changeLine(index: number, patch: Partial<Line>) {
    setLines((current) =>
      current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)),
    )
  }

  async function create(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      if (!warehouse?.id) throw new Error("Gudang belum dipilih")
      if (lines.some((line) => !line.variantId || Number(line.quantity) <= 0)) {
        throw new Error("Lengkapi item purchase order")
      }
      await apiFetch("/api/v1/purchases/orders", {
        method: "POST",
        body: JSON.stringify({
          branchId: branch?.id,
          warehouseId: warehouse.id,
          supplierId,
          expectedDate: expectedDate || undefined,
          notes: notes || undefined,
          status: "submitted",
          items: lines.map((line) => ({
            variantId: line.variantId,
            quantity: line.quantity,
            unitCostAmount: line.cost,
          })),
        }),
      })
      showSuccess("Purchase order berhasil dibuat")
      setOpen(false)
      reset()
      await orders.refresh()
    } catch (caught) {
      showError(caught instanceof Error ? caught.message : "Gagal membuat purchase order")
    } finally {
      setSaving(false)
    }
  }

  async function showDetail(id: string) {
    try {
      setDetail((await apiFetch<PurchaseDetail>(`/api/v1/purchases/orders/${id}`)).data)
    } catch (caught) {
      showError(caught instanceof Error ? caught.message : "Gagal mengambil detail")
    }
  }

  async function receiveAll() {
    if (!detail || !warehouse?.id) return
    const items = detail.items
      .map((item) => ({
        purchaseOrderItemId: item.id,
        variantId: item.variantId || item.variant_id,
        acceptedQuantity: String(
          BigInt(item.quantity) - BigInt(item.receivedQuantity || item.received_quantity || "0"),
        ),
        unitCostAmount: item.unitCostAmount || item.unit_cost_amount || "0",
      }))
      .filter((item) => BigInt(item.acceptedQuantity) > 0n)

    if (!items.length) return showInfo("Semua item sudah diterima")
    setSaving(true)
    try {
      await apiFetch("/api/v1/purchases/receipts", {
        method: "POST",
        body: JSON.stringify({
          purchaseOrderId: detail.order.id,
          warehouseId:
            detail.order.warehouseId || detail.order.warehouse_id || warehouse.id,
          notes: "Penerimaan melalui management",
          items,
        }),
      })
      showSuccess("Barang diterima dan stok diperbarui")
      setDetail(undefined)
      await orders.refresh()
    } catch (caught) {
      showError(caught instanceof Error ? caught.message : "Penerimaan gagal")
    } finally {
      setSaving(false)
    }
  }

  const total = orders.data.reduce((sum, order) => sum + Number(order.total_amount), 0)
  const openOrdersCount = orders.data.filter(
    (item) => !["received", "cancelled"].includes(item.status),
  ).length

  return (
    <div className="flex flex-1 flex-col gap-5 p-4 md:p-6">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Pembelian (PO)</h2>
          <p className="text-sm text-muted-foreground">
            Purchase order dan penerimaan barang masuk ke gudang.
          </p>
        </div>
        <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setOpen(true)}>
          <Plus className="size-4 mr-1.5" /> Buat PO
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="py-4 shadow-sm">
          <CardContent className="px-5 py-0 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total PO</p>
              <p className="mt-1 text-2xl font-bold tracking-tight">{orders.data.length}</p>
            </div>
            <div className="flex size-11 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-950">
              <Truck className="size-5 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="py-4 shadow-sm">
          <CardContent className="px-5 py-0 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">PO Terbuka</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-amber-600">
                {openOrdersCount}
              </p>
            </div>
            <div className="flex size-11 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-950">
              <Clock className="size-5 text-amber-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="py-4 shadow-sm">
          <CardContent className="px-5 py-0 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Nilai Total PO</p>
              <p className="mt-1 text-2xl font-bold tracking-tight">{rupiah(total)}</p>
            </div>
            <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950">
              <Banknote className="size-5 text-emerald-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table Card */}
      <Card className="shadow-sm">
        <CardHeader className="border-b pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base font-bold">Daftar Purchase Order</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Klik baris PO untuk melihat item detail dan melakukan penerimaan barang.
              </CardDescription>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari nomor PO / supplier..."
                className="pl-9 sm:w-72 h-9 text-xs"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No. PO</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Tanggal PO</TableHead>
                  <TableHead>Estimasi Sampai</TableHead>
                  <TableHead>Total Nilai</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.loading && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center">
                      <Loader2 className="mx-auto size-6 animate-spin text-emerald-600" />
                    </TableCell>
                  </TableRow>
                )}
                {!orders.loading && !visible.length && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground text-sm">
                      Belum ada data purchase order. Tambahkan supplier dan produk terlebih dahulu.
                    </TableCell>
                  </TableRow>
                )}
                {visible.map((order) => (
                  <TableRow
                    key={order.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => void showDetail(order.id)}
                  >
                    <TableCell className="font-semibold text-emerald-700 dark:text-emerald-400">
                      {order.order_number}
                    </TableCell>
                    <TableCell className="font-medium">
                      {supplierNames.get(order.supplier_id) || "—"}
                    </TableCell>
                    <TableCell>
                      {new Date(order.order_date).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell>
                      {order.expected_date
                        ? new Date(order.expected_date).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </TableCell>
                    <TableCell className="font-semibold">{rupiah(order.total_amount)}</TableCell>
                    <TableCell>{getStatusBadge(order.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Modal: Buat Purchase Order */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <form onSubmit={create}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Truck className="text-emerald-600" /> Buat Purchase Order
              </DialogTitle>
              <DialogDescription>
                Pilih supplier dan item barang yang akan dibeli untuk menambah stok gudang.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Supplier</Label>
                  <Select value={supplierId} onValueChange={setSupplierId} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih supplier" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.data
                        .filter((item) => item.is_active)
                        .map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Estimasi Tanggal Sampai (Opsional)</Label>
                  <Input
                    type="date"
                    value={expectedDate}
                    onChange={(event) => setExpectedDate(event.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="font-semibold">Daftar Item Barang</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setLines((current) => [...current, { variantId: "", quantity: "1", cost: "0" }])
                    }
                  >
                    <Plus className="size-3.5 mr-1" /> Tambah Item
                  </Button>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {lines.map((line, index) => (
                    <div
                      key={index}
                      className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_90px_130px_auto] items-center bg-muted/20"
                    >
                      <Select
                        value={line.variantId}
                        onValueChange={(value) => {
                          const variant = variants.data.find((item) => item.id === value)
                          changeLine(index, {
                            variantId: value,
                            cost: variant?.cost_amount || "0",
                          })
                        }}
                      >
                        <SelectTrigger className="text-xs">
                          <SelectValue placeholder="Pilih produk / varian" />
                        </SelectTrigger>
                        <SelectContent>
                          {variants.data
                            .filter((item) => item.is_active)
                            .map((item) => (
                              <SelectItem key={item.id} value={item.id}>
                                {variantNames.get(item.id)}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min="1"
                        value={line.quantity}
                        onChange={(event) => changeLine(index, { quantity: event.target.value })}
                        placeholder="Qty"
                        className="text-xs"
                        required
                      />
                      <Input
                        type="number"
                        min="0"
                        value={line.cost}
                        onChange={(event) => changeLine(index, { cost: event.target.value })}
                        placeholder="Harga Beli"
                        className="text-xs"
                        required
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive h-9 w-9"
                        onClick={() =>
                          setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))
                        }
                        disabled={lines.length === 1}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Catatan (Opsional)</Label>
                <Input
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Catatan pembelian / instruksi pengiriman"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Batal
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={saving || !supplierId}
              >
                {saving && <Loader2 className="size-4 mr-1.5 animate-spin" />}
                Buat PO
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Detail & Penerimaan Barang PO */}
      <Dialog open={Boolean(detail)} onOpenChange={(value) => !value && setDetail(undefined)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="text-emerald-600" /> Detail Purchase Order
            </DialogTitle>
            <DialogDescription>
              Rincian item barang dan status penerimaan fisik barang masuk.
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="py-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-center">Qty Dipesan</TableHead>
                    <TableHead className="text-center">Qty Diterima</TableHead>
                    <TableHead className="text-right">Harga Satuan</TableHead>
                    <TableHead className="text-right">Total Nilai</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                      <TableCell className="text-center font-semibold">{item.quantity}</TableCell>
                      <TableCell className="text-center font-semibold text-emerald-600">
                        {item.receivedQuantity || item.received_quantity || "0"}
                      </TableCell>
                      <TableCell className="text-right">
                        {rupiah(item.unitCostAmount || item.unit_cost_amount || 0)}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {rupiah(item.totalAmount || item.total_amount || 0)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetail(undefined)}>
              Tutup
            </Button>
            {detail && !["received", "cancelled"].includes(detail.order.status) && (
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => void receiveAll()}
                disabled={saving}
              >
                {saving && <Loader2 className="size-4 mr-1.5 animate-spin" />}
                Terima Semua Barang Masuk
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
