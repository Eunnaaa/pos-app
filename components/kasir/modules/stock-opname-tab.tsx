"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  Barcode,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useOrganization } from "@/components/kasir/organization-provider"
import { apiFetch } from "@/lib/client"
import { showError, showSuccess } from "@/lib/toast-handler"

type OpnameSession = {
  id: string
  countNumber: string
  status: "draft" | "counting" | "completed" | "cancelled"
  notes: string | null
  warehouseId: string
  warehouseName: string
  countedBy: string | null
  userName: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  itemCount: number
  varianceCount: number
}

type OpnameItem = {
  id: string
  variantId: string
  productName: string
  variantName: string
  displayName: string
  sku: string
  barcode: string | null
  categoryName: string | null
  costAmount: string
  expectedQuantity: string
  countedQuantity: string | null
  varianceQuantity: string | null
  reason: string | null
}

type OpnameDetail = OpnameSession & {
  summary: {
    totalItems: number
    matchedItems: number
    varianceItems: number
    uncountedItems: number
    totalExpected: string
    totalCounted: string
    totalVarianceQty: string
    totalVarianceValue: string
  }
  items: OpnameItem[]
}

const rupiah = (val: string | number | bigint) => `Rp ${Number(val).toLocaleString("id-ID")}`

export function StockOpnameTab() {
  const { organization, warehouse } = useOrganization()
  const isOwner = organization?.role === "owner"
  const warehouseList = useMemo(
    () => organization?.branches?.flatMap((b) => b.warehouses) || (warehouse ? [warehouse] : []),
    [organization?.branches, warehouse],
  )

  const [sessions, setSessions] = useState<OpnameSession[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<OpnameDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Create Modal
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [formWarehouseId, setFormWarehouseId] = useState("")
  const [formNotes, setFormNotes] = useState("")

  // Counting Form State
  const [countsMap, setCountsMap] = useState<Record<string, { counted: string; reason: string }>>({})
  const [searchQuery, setSearchQuery] = useState("")
  const [filterTab, setFilterTab] = useState<"all" | "uncounted" | "variance" | "matched">("all")
  const [barcodeInput, setBarcodeInput] = useState("")
  const [saving, setSaving] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [confirmCompleteOpen, setConfirmCompleteOpen] = useState(false)

  const loadSessions = useCallback(async () => {
    try {
      setLoading(true)
      const res = await apiFetch<OpnameSession[]>("/api/v1/inventory/counts")
      setSessions(res.data)
    } catch (err) {
      showError(err instanceof Error ? err.message : "Gagal memuat sesi stock opname")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSessions()
  }, [loadSessions])

  const openSessionDetail = useCallback(async (id: string) => {
    try {
      setSelectedId(id)
      setLoadingDetail(true)
      const res = await apiFetch<OpnameDetail>(`/api/v1/inventory/counts/${id}`)
      setDetail(res.data)

      // Initialize countsMap from detail items
      const map: Record<string, { counted: string; reason: string }> = {}
      for (const item of res.data.items) {
        map[item.variantId] = {
          counted: item.countedQuantity !== null ? item.countedQuantity : "",
          reason: item.reason || "",
        }
      }
      setCountsMap(map)
    } catch (err) {
      showError(err instanceof Error ? err.message : "Gagal memuat detail stock opname")
    } finally {
      setLoadingDetail(false)
    }
  }, [])

  async function handleCreateSession(e: React.FormEvent) {
    e.preventDefault()
    if (!formWarehouseId) {
      showError("Pilih gudang terlebih dahulu")
      return
    }

    try {
      setCreating(true)
      const res = await apiFetch<OpnameSession>("/api/v1/inventory/counts", {
        method: "POST",
        body: JSON.stringify({
          warehouseId: formWarehouseId,
          notes: formNotes || undefined,
        }),
      })
      showSuccess("Sesi Stock Opname berhasil dibuat")
      setCreateOpen(false)
      setFormNotes("")
      await loadSessions()
      void openSessionDetail(res.data.id)
    } catch (err) {
      showError(err instanceof Error ? err.message : "Gagal membuat sesi stock opname")
    } finally {
      setCreating(false)
    }
  }

  function handleCountChange(variantId: string, value: string) {
    setCountsMap((prev) => ({
      ...prev,
      [variantId]: {
        ...prev[variantId],
        counted: value,
      },
    }))
  }

  function handleReasonChange(variantId: string, reason: string) {
    setCountsMap((prev) => ({
      ...prev,
      [variantId]: {
        ...prev[variantId],
        reason,
      },
    }))
  }

  function handleBarcodeScan(e: React.FormEvent) {
    e.preventDefault()
    if (!barcodeInput.trim() || !detail) return

    const query = barcodeInput.trim().toLowerCase()
    const target = detail.items.find(
      (item) =>
        (item.barcode && item.barcode.toLowerCase() === query) ||
        item.sku.toLowerCase() === query,
    )

    if (target) {
      const current = countsMap[target.variantId]?.counted
      const nextVal = current ? String(Number(current) + 1) : "1"
      handleCountChange(target.variantId, nextVal)
      showSuccess(`+1 ${target.displayName} (Total: ${nextVal})`)
      setBarcodeInput("")
    } else {
      showError(`Produk dengan barcode/SKU "${barcodeInput}" tidak ditemukan dalam sesi ini`)
    }
  }

  async function handleSaveDraft() {
    if (!selectedId || !detail) return
    try {
      setSaving(true)
      const itemsToUpdate = Object.entries(countsMap)
        .filter(([, val]) => val.counted !== "")
        .map(([variantId, val]) => ({
          variantId,
          countedQuantity: Number(val.counted),
          reason: val.reason || undefined,
        }))

      if (itemsToUpdate.length === 0) {
        showSuccess("Belum ada angka hitungan yang diubah")
        return
      }

      await apiFetch(`/api/v1/inventory/counts/${selectedId}`, {
        method: "PUT",
        body: JSON.stringify({ items: itemsToUpdate }),
      })

      showSuccess("Progress hitungan berhasil disimpan")
      await openSessionDetail(selectedId)
      await loadSessions()
    } catch (err) {
      showError(err instanceof Error ? err.message : "Gagal menyimpan progress")
    } finally {
      setSaving(false)
    }
  }

  async function handleCompleteOpname() {
    if (!selectedId || !detail) return
    try {
      setCompleting(true)
      // Save any pending inputs first
      const itemsToUpdate = Object.entries(countsMap)
        .filter(([, val]) => val.counted !== "")
        .map(([variantId, val]) => ({
          variantId,
          countedQuantity: Number(val.counted),
          reason: val.reason || undefined,
        }))

      if (itemsToUpdate.length > 0) {
        await apiFetch(`/api/v1/inventory/counts/${selectedId}`, {
          method: "PUT",
          body: JSON.stringify({ items: itemsToUpdate }),
        })
      }

      await apiFetch(`/api/v1/inventory/counts/${selectedId}/complete`, {
        method: "POST",
        body: JSON.stringify({}),
      })

      showSuccess("Stock Opname selesai! Penyesuaian stok dan buku ledger telah diterapkan.")
      setConfirmCompleteOpen(false)
      await openSessionDetail(selectedId)
      await loadSessions()
    } catch (err) {
      showError(err instanceof Error ? err.message : "Gagal menyelesaikan stock opname")
    } finally {
      setCompleting(false)
    }
  }

  async function handleCancelOpname() {
    if (!selectedId || !confirm("Apakah Anda yakin ingin membatalkan sesi Stock Opname ini?")) return
    try {
      await apiFetch(`/api/v1/inventory/counts/${selectedId}`, { method: "DELETE" })
      showSuccess("Sesi Stock Opname telah dibatalkan")
      setSelectedId(null)
      setDetail(null)
      await loadSessions()
    } catch (err) {
      showError(err instanceof Error ? err.message : "Gagal membatalkan sesi")
    }
  }

  // Filter items in detail view
  const filteredItems = useMemo(() => {
    if (!detail) return []
    return detail.items.filter((item) => {
      const q = searchQuery.toLowerCase()
      const matchesSearch =
        item.displayName.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        (item.barcode && item.barcode.toLowerCase().includes(q)) ||
        (item.categoryName && item.categoryName.toLowerCase().includes(q))

      if (!matchesSearch) return false

      const countState = countsMap[item.variantId]
      const hasCount = countState && countState.counted !== ""
      const counted = hasCount ? BigInt(countState.counted) : null
      const exp = BigInt(item.expectedQuantity)

      if (filterTab === "uncounted") return !hasCount
      if (filterTab === "matched") return hasCount && counted === exp
      if (filterTab === "variance") return hasCount && counted !== exp
      return true
    })
  }, [detail, countsMap, searchQuery, filterTab])

  // Live calculation of variance for detail view
  const liveMetrics = useMemo(() => {
    if (!detail) return { matched: 0, variance: 0, uncounted: 0, totalDiffQty: 0n, totalDiffVal: 0n }
    let matched = 0
    let variance = 0
    let uncounted = 0
    let totalDiffQty = 0n
    let totalDiffVal = 0n

    for (const item of detail.items) {
      const state = countsMap[item.variantId]
      if (state && state.counted !== "") {
        const cnt = BigInt(state.counted)
        const exp = BigInt(item.expectedQuantity)
        const diff = cnt - exp
        totalDiffQty += diff
        totalDiffVal += diff * BigInt(item.costAmount)
        if (diff === 0n) matched++
        else variance++
      } else {
        uncounted++
      }
    }

    return { matched, variance, uncounted, totalDiffQty, totalDiffVal }
  }, [detail, countsMap])

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-bold">Riwayat & Sesi Stock Opname</h3>
          <p className="text-sm text-muted-foreground">
            Rekonsiliasi stok sistem dengan hitungan fisik riil di gudang.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadSessions()} disabled={loading}>
            <RefreshCw className={`size-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Segarkan
          </Button>
          {isOwner && (
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => {
                setFormWarehouseId(warehouse?.id || (warehouseList?.[0]?.id ?? ""))
                setCreateOpen(true)
              }}
            >
              <Plus className="size-4 mr-1.5" />
              Mulai Sesi Opname
            </Button>
          )}
        </div>
      </div>

      {/* Sesi List Table */}
      <Card className="shadow-sm py-4">
        <CardContent className="px-5 py-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nomor Dokumen</TableHead>
                  <TableHead>Gudang</TableHead>
                  <TableHead>Tanggal Mulai</TableHead>
                  <TableHead>Petugas</TableHead>
                  <TableHead>Total SKU</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center">
                      <Loader2 className="mx-auto size-6 animate-spin text-emerald-600" />
                    </TableCell>
                  </TableRow>
                )}
                {!loading && sessions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                      Belum ada sesi Stock Opname. Klik &quot;Mulai Sesi Opname&quot; untuk memulai hitung fisik.
                    </TableCell>
                  </TableRow>
                )}
                {sessions.map((s) => (
                  <TableRow key={s.id} className="hover:bg-muted/50 cursor-pointer" onClick={() => void openSessionDetail(s.id)}>
                    <TableCell className="font-semibold text-emerald-700 dark:text-emerald-400">
                      {s.countNumber}
                    </TableCell>
                    <TableCell className="font-medium">{s.warehouseName}</TableCell>
                    <TableCell>{new Date(s.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</TableCell>
                    <TableCell className="text-sm">{s.userName || "—"}</TableCell>
                    <TableCell>
                      <span className="font-medium">{s.itemCount} SKU</span>
                      {s.status === "completed" && s.varianceCount > 0 && (
                        <span className="ml-2 text-xs text-amber-600">({s.varianceCount} selisih)</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {s.status === "counting" && (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300">
                          Sedang Hitung
                        </Badge>
                      )}
                      {s.status === "completed" && (
                        <Badge variant="default" className="bg-emerald-600">
                          Selesai & Disesuaikan
                        </Badge>
                      )}
                      {s.status === "cancelled" && (
                        <Badge variant="secondary" className="text-muted-foreground">
                          Dibatalkan
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant={s.status === "counting" ? "default" : "outline"}
                        className={s.status === "counting" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
                        onClick={(e) => {
                          e.stopPropagation()
                          void openSessionDetail(s.id)
                        }}
                      >
                        {s.status === "counting" ? "Lanjutkan" : "Lihat Detail"}
                        <ChevronRight className="size-4 ml-1" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Modal / Dialog: Mulai Sesi Baru */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleCreateSession}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ClipboardCheck className="text-emerald-600" />
                Mulai Sesi Stock Opname
              </DialogTitle>
              <DialogDescription>
                Sistem akan membuat snapshot saldo stok saat ini sebagai referensi hitungan fisik.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Pilih Gudang Target</Label>
                <Select value={formWarehouseId} onValueChange={setFormWarehouseId} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih gudang" />
                  </SelectTrigger>
                  <SelectContent>
                    {(warehouseList || []).map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Catatan Sesi (Opsional)</Label>
                <Input
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Contoh: Opname Akhir Bulan / Audit Bulanan"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Batal
              </Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={creating}>
                {creating && <Loader2 className="size-4 mr-2 animate-spin" />}
                Buat Sesi Opname
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Full Sheet / Drawer / Modal: Lembar Kerja Stock Opname */}
      <Dialog open={Boolean(selectedId)} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0 gap-0">
          {/* Header */}
          <div className="p-5 border-b flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-muted/20">
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-xl font-bold">{detail?.countNumber}</h3>
                {detail?.status === "counting" && (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                    Sedang Dihitung
                  </Badge>
                )}
                {detail?.status === "completed" && (
                  <Badge variant="default" className="bg-emerald-600">
                    Selesai & Diterapkan
                  </Badge>
                )}
                {detail?.status === "cancelled" && (
                  <Badge variant="secondary">Dibatalkan</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Gudang: <span className="font-semibold text-foreground">{detail?.warehouseName}</span> • Dibuat:{" "}
                {detail?.createdAt ? new Date(detail.createdAt).toLocaleString("id-ID") : "—"}
              </p>
            </div>

            {detail?.status === "counting" && isOwner && (
              <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10" onClick={handleCancelOpname}>
                Batalkan Sesi
              </Button>
            )}
          </div>

          {loadingDetail && (
            <div className="flex flex-1 items-center justify-center p-12">
              <Loader2 className="size-8 animate-spin text-emerald-600" />
            </div>
          )}

          {!loadingDetail && detail && (
            <div className="flex flex-col flex-1 overflow-hidden">
              {/* Summary KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 border-b bg-background">
                <div className="rounded-xl border p-3 bg-card shadow-xs">
                  <p className="text-xs text-muted-foreground">Total Produk</p>
                  <p className="text-xl font-bold mt-0.5">{detail.items.length} SKU</p>
                </div>
                <div className="rounded-xl border p-3 bg-card shadow-xs">
                  <p className="text-xs text-muted-foreground">Sudah Dihitung</p>
                  <p className="text-xl font-bold text-emerald-600 mt-0.5">
                    {detail.items.length - liveMetrics.uncounted} / {detail.items.length}
                  </p>
                </div>
                <div className="rounded-xl border p-3 bg-card shadow-xs">
                  <p className="text-xs text-muted-foreground">Ada Selisih</p>
                  <p className={`text-xl font-bold mt-0.5 ${liveMetrics.variance > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                    {liveMetrics.variance} SKU
                  </p>
                </div>
                <div className="rounded-xl border p-3 bg-card shadow-xs">
                  <p className="text-xs text-muted-foreground">Dampak Finansial (HPP)</p>
                  <p className={`text-xl font-bold mt-0.5 ${liveMetrics.totalDiffVal < 0n ? "text-rose-600" : liveMetrics.totalDiffVal > 0n ? "text-blue-600" : "text-foreground"}`}>
                    {rupiah(liveMetrics.totalDiffVal)}
                  </p>
                </div>
              </div>

              {/* Barcode Quick Scan & Search Toolbar */}
              <div className="p-4 border-b flex flex-col sm:flex-row gap-3 items-center justify-between">
                {detail.status === "counting" && (
                  <form onSubmit={handleBarcodeScan} className="flex gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-72">
                      <Barcode className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={barcodeInput}
                        onChange={(e) => setBarcodeInput(e.target.value)}
                        placeholder="Scan Barcode / SKU lalu Enter (+1)"
                        className="pl-9 h-9 text-xs"
                      />
                    </div>
                    <Button type="submit" size="sm" variant="secondary" className="h-9">
                      Hitung
                    </Button>
                  </form>
                )}

                <div className="flex gap-2 w-full sm:w-auto items-center">
                  <div className="relative flex-1 sm:w-64">
                    <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Cari produk / SKU..."
                      className="pl-8 h-9 text-xs"
                    />
                  </div>
                  <Tabs value={filterTab} onValueChange={(v) => setFilterTab(v as "all" | "uncounted" | "variance" | "matched")}>
                    <TabsList className="h-9">
                      <TabsTrigger value="all" className="text-xs px-2.5">Semua</TabsTrigger>
                      <TabsTrigger value="variance" className="text-xs px-2.5">Selisih ({liveMetrics.variance})</TabsTrigger>
                      <TabsTrigger value="uncounted" className="text-xs px-2.5">Belum ({liveMetrics.uncounted})</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </div>

              {/* Items Table */}
              <div className="flex-1 overflow-y-auto p-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produk & Varian</TableHead>
                      <TableHead>SKU / Barcode</TableHead>
                      <TableHead className="text-center">Stok Sistem</TableHead>
                      <TableHead className="w-36 text-center">Fisik (Riil)</TableHead>
                      <TableHead className="text-center">Selisih</TableHead>
                      <TableHead className="min-w-[180px]">Alasan Selisih</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center text-muted-foreground text-sm">
                          Tidak ada produk yang cocok dengan filter.
                        </TableCell>
                      </TableRow>
                    )}
                    {filteredItems.map((item) => {
                      const countState = countsMap[item.variantId]
                      const hasCount = countState && countState.counted !== ""
                      const countedNum = hasCount ? Number(countState.counted) : null
                      const expNum = Number(item.expectedQuantity)
                      const diff = countedNum !== null ? countedNum - expNum : null
                      const isReadOnly = detail.status !== "counting"

                      return (
                        <TableRow key={item.id} className={diff && diff !== 0 ? "bg-amber-500/5" : ""}>
                          <TableCell className="font-medium">
                            <p className="text-sm font-semibold">{item.displayName}</p>
                            {item.categoryName && (
                              <span className="text-[11px] text-muted-foreground">{item.categoryName}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground font-mono">
                            {item.sku}
                            {item.barcode && <span className="block text-[10px] text-muted-foreground/70">{item.barcode}</span>}
                          </TableCell>
                          <TableCell className="text-center font-semibold">{item.expectedQuantity}</TableCell>
                          <TableCell className="text-center">
                            {isReadOnly ? (
                              <span className="font-bold">{item.countedQuantity ?? "—"}</span>
                            ) : (
                              <Input
                                type="number"
                                min={0}
                                value={countState?.counted ?? ""}
                                onChange={(e) => handleCountChange(item.variantId, e.target.value)}
                                placeholder={item.expectedQuantity}
                                className={`h-8 text-center font-bold text-sm ${diff && diff !== 0 ? "border-amber-400 bg-amber-50/50 dark:bg-amber-950/20" : ""}`}
                              />
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {diff === null ? (
                              <Badge variant="outline" className="text-xs text-muted-foreground">
                                Belum
                              </Badge>
                            ) : diff === 0 ? (
                              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                                Cocok (0)
                              </Badge>
                            ) : diff < 0 ? (
                              <Badge variant="destructive" className="gap-1 font-bold">
                                <TrendingDown className="size-3" />
                                {diff}
                              </Badge>
                            ) : (
                              <Badge className="bg-blue-600 gap-1 font-bold">
                                <TrendingUp className="size-3" />
                                +{diff}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {isReadOnly ? (
                              <span className="text-xs text-muted-foreground">{item.reason || "—"}</span>
                            ) : (
                              <Input
                                value={countState?.reason ?? ""}
                                onChange={(e) => handleReasonChange(item.variantId, e.target.value)}
                                placeholder={diff && diff !== 0 ? "Wajib isi alasan selisih..." : "Catatan (opsional)"}
                                className="h-8 text-xs"
                                disabled={diff === 0 || diff === null}
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Bottom Sticky Footer with Actions */}
              <div className="p-4 border-t bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground">
                  {detail.status === "counting" ? (
                    <span>💡 Tip: Angka yang tidak diisi akan dianggap tetap sama dengan stok sistem.</span>
                  ) : (
                    <span>Dokumen opname ini sudah selesai dan tersimpan ke buku ledger inventaris.</span>
                  )}
                </div>

                <div className="flex gap-2 w-full sm:w-auto">
                  <Button variant="outline" onClick={() => setSelectedId(null)}>
                    Tutup
                  </Button>
                  {detail.status === "counting" && (
                    <>
                      <Button variant="secondary" onClick={handleSaveDraft} disabled={saving}>
                        {saving && <Loader2 className="size-4 mr-1.5 animate-spin" />}
                        Simpan Draft
                      </Button>
                      <Button
                        className="bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => setConfirmCompleteOpen(true)}
                        disabled={completing}
                      >
                        <CheckCircle2 className="size-4 mr-1.5" />
                        Selesaikan Opname
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm Completion Modal */}
      <Dialog open={confirmCompleteOpen} onOpenChange={setConfirmCompleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="text-amber-600" />
              Konfirmasi Selesaikan Stock Opname
            </DialogTitle>
            <DialogDescription>
              Tindakan ini akan mengunci dokumen dan menerapkan penyesuaian stok langsung ke saldo inventaris dan mutasi ledger.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3 text-sm">
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Total SKU Terdata:</span>
              <span className="font-bold">{detail?.items.length} SKU</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">SKU Mengalami Selisih:</span>
              <span className="font-bold text-amber-600">{liveMetrics.variance} SKU</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Total Selisih Unit:</span>
              <span className="font-bold">{Number(liveMetrics.totalDiffQty)} unit</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Estimasi Dampak Finansial:</span>
              <span className={`font-bold ${liveMetrics.totalDiffVal < 0n ? "text-rose-600" : "text-blue-600"}`}>
                {rupiah(liveMetrics.totalDiffVal)}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmCompleteOpen(false)}>
              Periksa Lagi
            </Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleCompleteOpname} disabled={completing}>
              {completing && <Loader2 className="size-4 mr-1.5 animate-spin" />}
              Terapkan Penyesuaian
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
