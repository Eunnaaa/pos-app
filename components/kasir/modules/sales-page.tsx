"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, RefreshCw, RotateCcw, Search, Store } from "lucide-react"
import { showError, showSuccess } from "@/lib/toast-handler"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { apiFetch } from "@/lib/client"
import { subscribeToTable } from "@/lib/client/realtime"
import { useOrganization } from "@/components/kasir/organization-provider"

type Sale = {
  id: string
  order_number: string
  status: string
  total_amount: string
  paid_amount: string
  occurred_at: string
  customer_name?: string
  payment_methods: string
  item_count: number
  branch_id?: string
  branch_name?: string
}

type SaleItem = {
  id: string
  itemName?: string
  item_name?: string
  sku?: string
  quantity: string
  totalAmount?: string
  total_amount?: string
  variantId?: string
  variant_id?: string
}

type SaleDetail = {
  order: {
    id: string
    orderNumber?: string
    order_number?: string
    status: string
    totalAmount?: string
    total_amount?: string
    branch_name?: string
  }
  items: SaleItem[]
  payments: { id: string; method: string; amount: string; status: string }[]
  receipt?: { verificationToken?: string; verification_token?: string }
}

const rupiah = (value: string | number) => `Rp ${Number(value).toLocaleString("id-ID")}`

export function SalesPage() {
  const { organization, branch: activeGlobalBranch } = useOrganization()
  const [selectedBranchId, setSelectedBranchId] = useState<string>("active")
  const [data, setData] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [detail, setDetail] = useState<SaleDetail>()
  const [returnOpen, setReturnOpen] = useState(false)
  const [returnReason, setReturnReason] = useState("")
  const [returnQuantities, setReturnQuantities] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const isCashier = organization?.role === "cashier"

  const activeBranchName =
    isCashier
      ? activeGlobalBranch?.name || "Shift Cabang Aktif"
      : selectedBranchId === "all"
      ? "Semua Cabang"
      : selectedBranchId === "active"
      ? activeGlobalBranch?.name || "Cabang Aktif"
      : organization?.branches.find((b) => b.id === selectedBranchId)?.name || "Cabang Terpilih"

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true)
      try {
        let url = `/api/v1/sales?q=${encodeURIComponent(search)}&limit=100`
        if (!isCashier) {
          if (selectedBranchId === "all") {
            url += `&allBranches=true`
          } else if (selectedBranchId === "active") {
            if (activeGlobalBranch?.id) {
              url += `&branchId=${activeGlobalBranch.id}`
            }
          } else {
            url += `&branchId=${selectedBranchId}`
          }
        }

        const res = await apiFetch<Sale[]>(url)
        setData(res.data)
      } catch (caught) {
        if (!silent) {
          showError(caught instanceof Error ? caught.message : "Gagal mengambil transaksi")
        }
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [search, selectedBranchId, activeGlobalBranch?.id, isCashier]
  )

  useEffect(() => {
    const timer = window.setTimeout(() => void load(false), 250)
    return () => window.clearTimeout(timer)
  }, [load])

  const orgId = organization?.id
  useEffect(() => {
    if (!orgId) return
    const unsub1 = subscribeToTable("sales_orders", orgId, () => void load(true))
    const unsub2 = subscribeToTable("cash_register_sessions", orgId, () => void load(true))
    const refresh = () => void load(false)
    window.addEventListener("kedai-ku-context-change", refresh)
    return () => {
      unsub1?.()
      unsub2?.()
      window.removeEventListener("kedai-ku-context-change", refresh)
    }
  }, [orgId, load])

  async function showDetail(id: string) {
    try {
      const res = await apiFetch<SaleDetail>(`/api/v1/sales/${id}`)
      setDetail(res.data)
    } catch (caught) {
      showError(caught instanceof Error ? caught.message : "Gagal mengambil detail")
    }
  }

  function prepareReturn() {
    if (!detail) return
    setReturnQuantities(Object.fromEntries(detail.items.map((item) => [item.id, "0"])))
    setReturnReason("")
    setReturnOpen(true)
  }

  async function submitReturn(event: React.FormEvent) {
    event.preventDefault()
    if (!detail) return
    const items = detail.items
      .map((item) => ({ orderItemId: item.id, quantity: returnQuantities[item.id] || "0", restock: true }))
      .filter((item) => BigInt(item.quantity) > 0n)
    if (!items.length) return showError("Masukkan minimal satu kuantitas return")
    setSaving(true)
    try {
      await apiFetch("/api/v1/sales/returns", {
        method: "POST",
        body: JSON.stringify({ orderId: detail.order.id, reason: returnReason, items }),
        queueOffline: true,
      })
      showSuccess("Return dan refund diproses")
      setReturnOpen(false)
      setDetail(undefined)
      await load()
    } catch (caught) {
      showError(caught instanceof Error ? caught.message : "Return gagal")
    } finally {
      setSaving(false)
    }
  }

  const isNonSuccessful = (status: string) =>
    ["held", "pending", "draft", "cancelled"].includes((status || "").toLowerCase().trim())
  const successfulSales = (data || []).filter((sale) => !isNonSuccessful(sale.status))
  const totalSuccessCount = successfulSales.length
  const totalSuccessAmount = successfulSales.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0)
  const refundedCount = (data || []).filter((sale) => sale.status.toLowerCase().includes("refund")).length

  return (
    <div className="flex flex-1 flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold">Transaksi Penjualan</h2>
            {isCashier && (
              <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 hover:bg-emerald-100">
                Mode Kasir
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isCashier
              ? `Menampilkan riwayat transaksi shift & cabang yang sedang dibuka (${activeBranchName}).`
              : `Pilih cabang untuk memantau transaksi spesifik atau lihat rekap gabungan semua cabang.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCw className="size-4" /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Total transaksi (Berhasil)</span>
              <Badge variant="secondary" className="text-xs font-normal">
                {activeBranchName}
              </Badge>
            </div>
            <p className="mt-2 text-2xl font-bold">{totalSuccessCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Nilai transaksi (Berhasil)</span>
              <Badge variant="secondary" className="text-xs font-normal">
                {activeBranchName}
              </Badge>
            </div>
            <p className="mt-2 text-2xl font-bold">{rupiah(totalSuccessAmount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Refunded</span>
              <Badge variant="secondary" className="text-xs font-normal">
                {activeBranchName}
              </Badge>
            </div>
            <p className="mt-2 text-2xl font-bold">{refundedCount}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Daftar transaksi</CardTitle>
              <CardDescription>
                {isCashier
                  ? "Transaksi kasir yang diproses pada shift aktif saat ini."
                  : "Klik transaksi untuk melihat detail receipt & pembayaran."}
              </CardDescription>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* Filter Cabang: Kasir dikunci ke shift cabang aktif, Owner bebas memilih */}
              {isCashier ? (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 text-xs font-medium shrink-0">
                  <Store className="size-3.5 shrink-0" />
                  <span>Cabang Shift: {activeGlobalBranch?.name || "Utama"}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
                    <SelectTrigger className="w-full sm:w-[220px]">
                      <Store className="size-4 text-muted-foreground shrink-0" />
                      <SelectValue placeholder="Pilih Cabang" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">
                        📍 Cabang Aktif ({activeGlobalBranch?.name || "Utama"})
                      </SelectItem>
                      <SelectItem value="all">
                        🌐 Semua Cabang (Gabungan)
                      </SelectItem>
                      {organization?.branches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          🏢 {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Pencarian */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Cari invoice / pelanggan..."
                  className="pl-9 sm:w-64"
                />
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">No.</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Waktu</TableHead>
                  <TableHead>Cabang</TableHead>
                  <TableHead>Pelanggan</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Pembayaran</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={9} className="h-32 text-center">
                      <Loader2 className="mx-auto animate-spin" />
                    </TableCell>
                  </TableRow>
                )}
                {!loading && !data.length && (
                  <TableRow>
                    <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                      {isCashier
                        ? "Belum ada transaksi di shift aktif ini. Transaksi baru yang diproses melalui POS akan otomatis tercatat di sini."
                        : `Belum ada transaksi pada ${activeBranchName}. Gunakan POS untuk membuat transaksi pertama.`}
                    </TableCell>
                  </TableRow>
                )}
                {data.map((sale, index) => {
                  const isHeldOrPending = ["held", "pending", "draft"].includes(sale.status.toLowerCase())
                  const isPaid = sale.status.toLowerCase() === "paid"
                  return (
                    <TableRow key={sale.id} className="cursor-pointer" onClick={() => void showDetail(sale.id)}>
                      <TableCell className="font-medium">{index + 1}</TableCell>
                      <TableCell className="font-mono text-xs">{sale.order_number.slice(-8)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(sale.occurred_at).toLocaleString("id-ID", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs font-normal gap-1 bg-slate-50 dark:bg-slate-900/60">
                          <Store className="size-3 text-muted-foreground" />
                          {sale.branch_name || "Cabang Utama"}
                        </Badge>
                      </TableCell>
                      <TableCell>{sale.customer_name || "Pelanggan umum"}</TableCell>
                      <TableCell>{sale.item_count}</TableCell>
                      <TableCell>{sale.payment_methods || "—"}</TableCell>
                      <TableCell className="font-semibold">{rupiah(sale.total_amount)}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            isPaid
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200"
                              : isHeldOrPending
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200"
                              : ""
                          }
                        >
                          {sale.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(undefined)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detail?.order.orderNumber || detail?.order.order_number}</DialogTitle>
            <DialogDescription>Detail item, pembayaran, dan receipt transaksi.</DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No.</TableHead>
                    <TableHead>Nama Item</TableHead>
                    <TableHead>Kuantitas</TableHead>
                    <TableHead>Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.items.map((item, index) => (
                    <TableRow key={item.id}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>{item.itemName || item.item_name}</TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>{rupiah(item.totalAmount || item.total_amount || 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="rounded-lg bg-muted p-4 space-y-2">
                <div className="flex justify-between">
                  <span>Total</span>
                  <strong>{rupiah(detail.order.totalAmount || detail.order.total_amount || 0)}</strong>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Status</span>
                  <Badge variant="outline">{detail.order.status}</Badge>
                </div>
                <p className="mt-3 break-all text-xs text-muted-foreground border-t pt-2">
                  Verifikasi: {detail.receipt?.verificationToken || detail.receipt?.verification_token || "—"}
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => window.print()}>
              Cetak
            </Button>
            {detail && ["paid", "partially_refunded"].includes(detail.order.status) && (
              <Button variant="destructive" onClick={prepareReturn}>
                <RotateCcw className="size-4" /> Return
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent>
          <form onSubmit={submitReturn}>
            <DialogHeader>
              <DialogTitle>Return transaksi</DialogTitle>
              <DialogDescription>Masukkan kuantitas yang dikembalikan. Stok akan ditambahkan kembali.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-5">
              {detail?.items.map((item) => (
                <div key={item.id} className="grid grid-cols-[1fr_100px] items-center gap-3">
                  <Label>
                    {item.itemName || item.item_name} (maks. {item.quantity})
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    max={item.quantity}
                    value={returnQuantities[item.id] || "0"}
                    onChange={(event) =>
                      setReturnQuantities((current) => ({ ...current, [item.id]: event.target.value }))
                    }
                  />
                </div>
              ))}
              <div className="space-y-2">
                <Label>Alasan return</Label>
                <Input
                  value={returnReason}
                  onChange={(event) => setReturnReason(event.target.value)}
                  required
                  minLength={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setReturnOpen(false)}>
                Batal
              </Button>
              <Button variant="destructive" disabled={saving}>
                {saving && <Loader2 className="animate-spin" />} Proses return
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
