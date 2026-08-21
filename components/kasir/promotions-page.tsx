"use client"

import { useMemo, useState } from "react"
import { Calendar, Loader2, MessageSquare, Pencil, Percent, Plus, Search, Send, Sparkles, Tag, Trash2 } from "lucide-react"
import { showError, showSuccess } from "@/lib/toast-handler"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useOrganization } from "@/components/kasir/organization-provider"
import { useResource } from "@/hooks/use-resource"

export type PromotionRecord = {
  id: string
  name: string
  code?: string | null
  type: string
  value_amount?: string | null
  valueAmount?: string | null
  percentage_bps?: number | null
  percentageBps?: number | null
  starts_at?: string | null
  startsAt?: string | null
  ends_at?: string | null
  endsAt?: string | null
  usage_limit?: number | null
  usageLimit?: number | null
  usage_count?: number | null
  usageCount?: number | null
  is_active?: boolean
  isActive?: boolean
  created_at?: string
}

type PromotionForm = {
  name: string
  code: string
  type: string
  percentage: string
  valueAmount: string
  usageLimit: string
  startsAt: string
  endsAt: string
  active: boolean
}

const emptyForm: PromotionForm = {
  name: "",
  code: "",
  type: "percentage",
  percentage: "10",
  valueAmount: "",
  usageLimit: "",
  startsAt: "",
  endsAt: "",
  active: true,
}

const PROMO_TYPES: Record<string, { label: string; badgeColor: string }> = {
  percentage: { label: "Diskon Persentase (%)", badgeColor: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  fixed: { label: "Potongan Tetap (Rp)", badgeColor: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" },
  buy_x_get_y: { label: "Beli X Gratis Y (BOGO)", badgeColor: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300" },
  bundle: { label: "Paket Bundling", badgeColor: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300" },
  cashback: { label: "Cashback", badgeColor: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300" },
  happy_hour: { label: "Happy Hour", badgeColor: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  flash_sale: { label: "Flash Sale", badgeColor: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300" },
  birthday: { label: "Promo Ulang Tahun", badgeColor: "bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-300" },
}

const rupiah = (value: string | number | null | undefined) => `Rp ${Number(value || 0).toLocaleString("id-ID")}`

type CustomerRecord = {
  id: string
  name: string
  code: string
  phone?: string | null
  is_active: boolean
}

export function PromotionsPage() {
  const { organization } = useOrganization()
  const resource = useResource<PromotionRecord>("promotions", "limit=100")
  const customerResource = useResource<CustomerRecord>("customers", "limit=100")

  const [search, setSearch] = useState("")
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<PromotionRecord | undefined>()
  const [form, setForm] = useState<PromotionForm>(emptyForm)

  // WhatsApp Promo Broadcast State
  const [broadcastOpen, setBroadcastOpen] = useState(false)
  const [selectedPromoId, setSelectedPromoId] = useState<string>("")
  const [customMsgNote, setCustomMsgNote] = useState<string>("")
  const [broadcastSearch, setBroadcastSearch] = useState<string>("")

  const data = Array.isArray(resource.data) ? resource.data : []
  const visible = useMemo(() => {
    return data.filter((item) => {
      const q = search.toLowerCase()
      return (
        (item.name || "").toLowerCase().includes(q) ||
        (item.code || "").toLowerCase().includes(q) ||
        (item.type || "").toLowerCase().includes(q)
      )
    })
  }, [data, search])

  const totalPromos = data.length
  const activePromos = data.filter((item) => item.is_active ?? item.isActive ?? true).length
  const couponPromos = data.filter((item) => Boolean(item.code)).length

  function showCreate() {
    setEditing(undefined)
    setForm({ ...emptyForm })
    setOpen(true)
  }

  function showEdit(item: PromotionRecord) {
    setEditing(item)
    const percentage = item.percentage_bps ?? item.percentageBps
    const valAmt = item.value_amount ?? item.valueAmount
    const start = item.starts_at ?? item.startsAt
    const end = item.ends_at ?? item.endsAt
    const limit = item.usage_limit ?? item.usageLimit
    const active = item.is_active ?? item.isActive ?? true

    setForm({
      name: item.name || "",
      code: item.code || "",
      type: item.type || "percentage",
      percentage: percentage ? String(percentage / 100) : "10",
      valueAmount: valAmt ? String(valAmt) : "",
      usageLimit: limit !== null && limit !== undefined ? String(limit) : "",
      startsAt: start ? new Date(start).toISOString().slice(0, 16) : "",
      endsAt: end ? new Date(end).toISOString().slice(0, 16) : "",
      active,
    })
    setOpen(true)
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!form.name.trim()) {
      showError("Nama promo wajib diisi")
      return
    }

    setSaving(true)
    try {
      const isPercentage = form.type === "percentage" || form.type === "happy_hour" || form.type === "flash_sale"
      const percentageBps = isPercentage && form.percentage ? Math.round(Number(form.percentage) * 100) : 0
      const valueAmount = !isPercentage && form.valueAmount ? String(form.valueAmount) : null
      const usageLimit = form.usageLimit ? Number(form.usageLimit) : null
      const startsAt = form.startsAt ? new Date(form.startsAt).toISOString() : new Date().toISOString()
      const endsAt = form.endsAt ? new Date(form.endsAt).toISOString() : null

      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        code: form.code.trim() ? form.code.trim().toUpperCase() : null,
        type: form.type,
        percentageBps,
        valueAmount,
        usageLimit,
        startsAt,
        endsAt,
        isActive: form.active,
      }

      if (editing) {
        await resource.update(editing.id, payload)
        showSuccess(`Promosi "${form.name}" diperbarui`)
      } else {
        await resource.create(payload)
        showSuccess(`Promosi "${form.name}" ditambahkan`)
      }
      setOpen(false)
    } catch (caught) {
      showError(caught instanceof Error ? caught.message : "Gagal menyimpan promosi")
    } finally {
      setSaving(false)
    }
  }

  async function remove(item: PromotionRecord) {
    if (!confirm(`Hapus promosi "${item.name}"?`)) return
    try {
      await resource.remove(item.id)
      showSuccess("Promosi dihapus")
    } catch (caught) {
      showError(caught instanceof Error ? caught.message : "Gagal menghapus")
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <Percent className="size-5" />
          </span>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Promosi &amp; Diskon</h2>
            <p className="text-sm text-muted-foreground">
              Kelola diskon kasir, promo otomatis, voucher kupon, dan flash sale.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              if (data.length > 0) setSelectedPromoId(data[0].id)
              setBroadcastOpen(true)
            }}
            variant="outline"
            className="border-emerald-500 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950 font-semibold gap-1.5 h-9 rounded-xl text-xs"
          >
            <MessageSquare className="size-4" /> Broadcast Promo WhatsApp
          </Button>
          <Button onClick={showCreate} className="bg-emerald-600 hover:bg-emerald-700 font-semibold gap-1.5 h-9 rounded-xl text-xs">
            <Plus className="size-4" /> Tambah Promosi
          </Button>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="rounded-2xl">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Total Promosi</p>
                <p className="mt-1 text-2xl font-bold">{totalPromos}</p>
              </div>
              <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                <Tag className="size-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Promosi Aktif</p>
                <p className="mt-1 text-2xl font-bold text-emerald-600">{activePromos}</p>
              </div>
              <div className="flex size-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                <Sparkles className="size-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Kode Kupon Tersedia</p>
                <p className="mt-1 text-2xl font-bold text-amber-600">{couponPromos}</p>
              </div>
              <div className="flex size-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                <Percent className="size-5" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table Card */}
      <Card className="rounded-2xl">
        <CardHeader className="border-b">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base font-bold">Daftar Program Promosi</CardTitle>
              <CardDescription className="text-xs">
                Diskon yang aktif otomatis diterapkan atau dapat diklaim kasir/pelanggan.
              </CardDescription>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari promo atau kode..."
                className="pl-9 text-xs sm:w-64 rounded-xl"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama Promo</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Nilai Diskon</TableHead>
                  <TableHead>Kuota Penggunaan</TableHead>
                  <TableHead>Periode</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {resource.loading && (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center">
                      <Loader2 className="mx-auto animate-spin text-emerald-600" />
                    </TableCell>
                  </TableRow>
                )}
                {!resource.loading && visible.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground text-xs">
                      Belum ada program promosi. Klik tombol &quot;Tambah Promosi&quot; untuk membuat promo baru.
                    </TableCell>
                  </TableRow>
                )}
                {visible.map((item) => {
                  const typeInfo = PROMO_TYPES[item.type] || { label: item.type, badgeColor: "bg-muted text-muted-foreground" }
                  const bps = item.percentage_bps ?? item.percentageBps ?? 0
                  const val = item.value_amount ?? item.valueAmount
                  const active = item.is_active ?? item.isActive ?? true
                  const limit = item.usage_limit ?? item.usageLimit
                  const count = item.usage_count ?? item.usageCount ?? 0

                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <p className="font-semibold text-sm">{item.name}</p>
                        {item.code ? (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] text-muted-foreground">Kupon:</span>
                            <code className="bg-muted px-1.5 py-0.5 rounded text-[11px] font-mono font-bold text-emerald-700 dark:text-emerald-400">
                              {item.code}
                            </code>
                          </div>
                        ) : (
                          <span className="text-[10px] text-muted-foreground italic">Otomatis saat checkout</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] rounded-md font-semibold ${typeInfo.badgeColor}`}>
                          {typeInfo.label.split(" ")[0]}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-semibold text-sm">
                        {bps > 0 ? `${bps / 100}%` : val ? rupiah(val) : "Khusus"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {limit ? `${count} / ${limit} kali` : "Tanpa Batas"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {item.starts_at || item.startsAt ? (
                          <div className="flex items-center gap-1">
                            <Calendar className="size-3" />
                            {new Date(item.starts_at ?? item.startsAt ?? "").toLocaleDateString("id-ID", { dateStyle: "medium" })}
                          </div>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={active ? "default" : "outline"}
                          className={active ? "bg-emerald-600 text-[10px] font-semibold" : "text-[10px]"}
                        >
                          {active ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => showEdit(item)}>
                            <Pencil className="size-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => void remove(item)}>
                            <Trash2 className="size-4" />
                          </Button>
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

      {/* Dialog Modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg rounded-2xl">
          <form onSubmit={save}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg font-bold">
                <Percent className="size-5 text-emerald-600" />
                {editing ? "Edit Promosi" : "Tambah Promosi Baru"}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Atur kriteria diskon, kode kupon, dan batas pemakaian.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="promo-name" className="text-xs font-semibold">Nama Promosi</Label>
                <Input
                  id="promo-name"
                  value={form.name}
                  onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
                  placeholder="Contoh: Diskon Kemerdekaan 17%, Flash Sale Sore"
                  required
                  className="h-9 text-xs rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="promo-type" className="text-xs font-semibold">Tipe Promo</Label>
                <Select value={form.type} onValueChange={(val) => setForm((c) => ({ ...c, type: val }))}>
                  <SelectTrigger id="promo-type" className="h-9 text-xs rounded-xl">
                    <SelectValue placeholder="Pilih Tipe" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PROMO_TYPES).map(([key, info]) => (
                      <SelectItem key={key} value={key} className="text-xs">
                        {info.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="promo-code" className="text-xs font-semibold">Kode Kupon (Opsional)</Label>
                <Input
                  id="promo-code"
                  value={form.code}
                  onChange={(e) => setForm((c) => ({ ...c, code: e.target.value.toUpperCase() }))}
                  placeholder="Contoh: PROMO17, DISKON50"
                  className="h-9 text-xs font-mono font-bold rounded-xl"
                />
              </div>

              {form.type === "percentage" || form.type === "happy_hour" || form.type === "flash_sale" ? (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="promo-percentage" className="text-xs font-semibold">Besaran Diskon (%)</Label>
                  <Input
                    id="promo-percentage"
                    type="number"
                    min="1"
                    max="100"
                    step="0.5"
                    value={form.percentage}
                    onChange={(e) => setForm((c) => ({ ...c, percentage: e.target.value }))}
                    placeholder="10"
                    required
                    className="h-9 text-xs rounded-xl"
                  />
                </div>
              ) : (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="promo-value" className="text-xs font-semibold">Nominal Potongan (Rp)</Label>
                  <Input
                    id="promo-value"
                    type="number"
                    min="100"
                    step="500"
                    value={form.valueAmount}
                    onChange={(e) => setForm((c) => ({ ...c, valueAmount: e.target.value }))}
                    placeholder="15000"
                    required
                    className="h-9 text-xs rounded-xl"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="promo-limit" className="text-xs font-semibold">Batas Kuota Pemakaian</Label>
                <Input
                  id="promo-limit"
                  type="number"
                  min="1"
                  value={form.usageLimit}
                  onChange={(e) => setForm((c) => ({ ...c, usageLimit: e.target.value }))}
                  placeholder="Kosongkan jika tanpa batas"
                  className="h-9 text-xs rounded-xl"
                />
              </div>

              <div className="flex items-center justify-between rounded-xl border p-3">
                <div>
                  <Label htmlFor="promo-active" className="text-xs font-semibold">Status Aktif</Label>
                  <p className="text-[10px] text-muted-foreground">Dapat dipakai saat transaksi</p>
                </div>
                <Switch
                  id="promo-active"
                  checked={form.active}
                  onCheckedChange={(checked) => setForm((c) => ({ ...c, active: checked }))}
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" className="rounded-xl h-9 text-xs" onClick={() => setOpen(false)}>
                Batal
              </Button>
              <Button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-9 text-xs font-semibold"
                disabled={saving}
              >
                {saving ? <><Loader2 className="size-4 animate-spin" /> Menyimpan...</> : "Simpan Promosi"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Broadcast WhatsApp Dialog */}
      <Dialog open={broadcastOpen} onOpenChange={setBroadcastOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <MessageSquare className="size-5" /> Broadcast Promo ke Pelanggan WhatsApp
            </DialogTitle>
            <DialogDescription>
              Kirim promosi dan voucher diskon secara personal ke kontak member CRM via WhatsApp.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Pilih Program Promosi</Label>
                <Select value={selectedPromoId} onValueChange={setSelectedPromoId}>
                  <SelectTrigger className="h-9 text-xs rounded-xl">
                    <SelectValue placeholder="Pilih Promosi" />
                  </SelectTrigger>
                  <SelectContent>
                    {data.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} {p.code ? `(${p.code})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Catatan Tambahan (Opsional)</Label>
                <Input
                  placeholder="Misal: Tunjukkan pesan ini ke kasir"
                  value={customMsgNote}
                  onChange={(e) => setCustomMsgNote(e.target.value)}
                  className="h-9 text-xs rounded-xl"
                />
              </div>
            </div>

            {/* Live WhatsApp Bubble Preview */}
            {(() => {
              const promo = data.find((p) => p.id === selectedPromoId) || data[0]
              const storeName = organization?.name || "KASIR KITA"
              const promoDesc = promo
                ? promo.percentage_bps
                  ? `Diskon Spesial ${promo.percentage_bps / 100}%`
                  : promo.value_amount
                  ? `Potongan Langsung ${rupiah(promo.value_amount)}`
                  : promo.name
                : "Diskon Menarik"

              const previewMsg = `*KABAR GEMBIRA DARI ${storeName.toUpperCase()}!* 🎉\n\nHalo Kak *[Nama Pelanggan]*, nikmati promo *${promo?.name || "Spesial"}*!\n✨ ${promoDesc}${promo?.code ? `\n🏷️ Gunakan Kode Kupon: *${promo.code}*` : ""}${promo?.ends_at ? `\n⏳ Berlaku s/d: ${new Date(promo.ends_at).toLocaleDateString("id-ID")}` : ""}${customMsgNote ? `\n\n📌 Catatan: ${customMsgNote}` : ""}\n\nYuk kunjungi kami dan nikmati menu favoritmu hari ini! ☕🍛`

              return (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Preview Pesan WhatsApp</Label>
                  <div className="rounded-2xl bg-[#EFEAE2] dark:bg-[#111B21] p-4 text-xs font-sans text-foreground shadow-inner">
                    <div className="max-w-md rounded-2xl rounded-tl-none bg-[#DCF8C6] dark:bg-[#005C4B] dark:text-white p-3.5 shadow-sm text-xs leading-relaxed whitespace-pre-wrap">
                      {previewMsg}
                      <span className="block text-[10px] text-muted-foreground dark:text-emerald-200/70 text-right mt-2">
                        12:00 ✓✓
                      </span>
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Target Contacts List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">
                  Daftar Member WhatsApp ({customerResource.data.filter((c) => c.phone).length} Kontak Tersedia)
                </Label>
                <Input
                  placeholder="Cari member..."
                  value={broadcastSearch}
                  onChange={(e) => setBroadcastSearch(e.target.value)}
                  className="h-8 text-xs w-48 rounded-xl"
                />
              </div>

              <ScrollArea className="h-52 rounded-xl border p-2 bg-muted/20">
                <div className="space-y-2">
                  {customerResource.data
                    .filter((c) => {
                      if (!c.phone) return false
                      const q = broadcastSearch.toLowerCase()
                      return (c.name || "").toLowerCase().includes(q) || (c.phone || "").includes(q)
                    })
                    .map((cust) => {
                      const promo = data.find((p) => p.id === selectedPromoId) || data[0]
                      const storeName = organization?.name || "KASIR KITA"
                      const promoDesc = promo
                        ? promo.percentage_bps
                          ? `Diskon Spesial ${promo.percentage_bps / 100}%`
                          : promo.value_amount
                          ? `Potongan Langsung ${rupiah(promo.value_amount)}`
                          : promo.name
                        : "Diskon Menarik"

                      const cleanPhone = (cust.phone || "").replace(/[^0-9]/g, "").replace(/^0/, "62")
                      const personalizedMsg = `*KABAR GEMBIRA DARI ${storeName.toUpperCase()}!* 🎉\n\nHalo Kak *${cust.name}*, nikmati promo *${promo?.name || "Spesial"}*!\n✨ ${promoDesc}${promo?.code ? `\n🏷️ Gunakan Kode Kupon: *${promo.code}*` : ""}${promo?.ends_at ? `\n⏳ Berlaku s/d: ${new Date(promo.ends_at).toLocaleDateString("id-ID")}` : ""}${customMsgNote ? `\n\n📌 Catatan: ${customMsgNote}` : ""}\n\nYuk kunjungi kami dan nikmati menu favoritmu hari ini! ☕🍛`
                      const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(personalizedMsg)}`

                      return (
                        <div
                          key={cust.id}
                          className="flex items-center justify-between rounded-xl border bg-card p-2.5 shadow-2xs text-xs"
                        >
                          <div>
                            <p className="font-semibold text-foreground">{cust.name}</p>
                            <p className="text-[11px] text-muted-foreground font-mono">{cust.phone}</p>
                          </div>
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-7 rounded-lg gap-1"
                            onClick={() => window.open(waUrl, "_blank")}
                          >
                            <Send className="size-3" /> Kirim WA
                          </Button>
                        </div>
                      )
                    })}
                </div>
              </ScrollArea>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" className="rounded-xl h-9 text-xs" onClick={() => setBroadcastOpen(false)}>
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
