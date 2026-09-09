"use client"

import { useState } from "react"
import {
  Building2,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  QrCode,
  Search,
  Trash2,
  Warehouse,
} from "lucide-react"
import { useOrganization } from "@/components/kasir/organization-provider"
import { apiFetch } from "@/lib/client"
import { showError, showSuccess } from "@/lib/toast-handler"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type BranchDetail = {
  id: string
  name: string
  code: string
  phone?: string
  email?: string
  address?: string
  city?: string
  province?: string
  postal_code?: string
  is_active: boolean
  qrisImageUrl?: string | null
  qrisAccountName?: string | null
  qrisInstructions?: string | null
  metadata?: Record<string, unknown>
}

const emptyForm = {
  name: "",
  code: "",
  city: "",
  phone: "",
  address: "",
  qrisImageUrl: "",
  qrisAccountName: "",
  qrisInstructions: "",
  midtransServerKey: "",
  midtransClientKey: "",
  paymentMode: "inherit" as "inherit" | "branch_midtrans" | "manual_qris",
}

export function BranchesPage() {
  const { organization, refresh } = useOrganization()
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string>()
  const [search, setSearch] = useState("")

  async function loadBranchDetail(id: string) {
    try {
      const response = await apiFetch<BranchDetail>(`/api/v1/resources/branches/${id}`)
      const branch = response.data
      const meta = (branch.metadata || {}) as Record<string, unknown>
      setForm({
        name: branch.name || "",
        code: branch.code || "",
        city: branch.city || "",
        phone: branch.phone || "",
        address: branch.address || "",
        qrisImageUrl: (branch.qrisImageUrl || meta.qrisImageUrl || "") as string,
        qrisAccountName: (branch.qrisAccountName || meta.qrisAccountName || "") as string,
        qrisInstructions: (branch.qrisInstructions || meta.qrisInstructions || "") as string,
        midtransServerKey: (meta.midtransServerKey || "") as string,
        midtransClientKey: (meta.midtransClientKey || "") as string,
        paymentMode: ((meta.paymentMode as "inherit" | "branch_midtrans" | "manual_qris") || "inherit"),
      })
      setEditingId(id)
      setOpen(true)
    } catch (error) {
      showError(error instanceof Error ? error.message : "Gagal memuat detail cabang")
    }
  }

  function handleBranchQrisUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      showError("Format foto QRIS harus PNG atau JPG")
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      showError("Ukuran foto QRIS maksimal 2MB")
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      setForm((prev) => ({ ...prev, qrisImageUrl: result }))
      showSuccess("Foto QRIS cabang berhasil dimuat!")
    }
    reader.readAsDataURL(file)
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!form.name) return
    setSaving(true)
    try {
      if (editingId) {
        await apiFetch(`/api/v1/branches/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: form.name.trim(),
            city: form.city.trim() || undefined,
            phone: form.phone.trim() || undefined,
            address: form.address.trim() || undefined,
            qrisImageUrl: form.qrisImageUrl || null,
            qrisAccountName: form.qrisAccountName.trim() || null,
            qrisInstructions: form.qrisInstructions.trim() || null,
            ...(form.midtransServerKey.trim() ? { midtransServerKey: form.midtransServerKey.trim() } : {}),
            ...(form.midtransClientKey.trim() ? { midtransClientKey: form.midtransClientKey.trim() } : {}),
            paymentMode: form.paymentMode,
          }),
        })
        showSuccess("Cabang & Metode Pembayaran diperbarui")
      } else {
        if (!form.code) { showError("Kode cabang wajib diisi"); setSaving(false); return }
        await apiFetch("/api/v1/branches", {
          method: "POST",
          body: JSON.stringify({
            name: form.name.trim(),
            code: form.code.trim().toUpperCase(),
            city: form.city.trim() || undefined,
            phone: form.phone.trim() || undefined,
            address: form.address.trim() || undefined,
            qrisImageUrl: form.qrisImageUrl || null,
            qrisAccountName: form.qrisAccountName.trim() || null,
            qrisInstructions: form.qrisInstructions.trim() || null,
            midtransServerKey: form.midtransServerKey.trim() || null,
            midtransClientKey: form.midtransClientKey.trim() || null,
            paymentMode: form.paymentMode,
          }),
        })
        showSuccess(`Cabang ${form.name} ditambahkan`)
      }
      setForm({ ...emptyForm })
      setEditingId(undefined)
      setOpen(false)
      await refresh()
      window.dispatchEvent(new Event("kedai-ku-context-change"))
    } catch (error) {
      showError(error instanceof Error ? error.message : "Gagal menyimpan cabang", { error })
    } finally {
      setSaving(false)
    }
  }

  async function deactivate(id: string, name: string) {
    if (!confirm(`Nonaktifkan cabang "${name}"? Cabang dapat diaktifkan kembali nanti.`)) return
    try {
      await apiFetch(`/api/v1/branches/${id}`, { method: "DELETE" })
      showSuccess(`Cabang ${name} dinonaktifkan`)
      await refresh()
      window.dispatchEvent(new Event("kedai-ku-context-change"))
    } catch (error) {
      showError(error instanceof Error ? error.message : "Gagal menonaktifkan cabang")
    }
  }

  if (!organization) return null

  const branches = organization.branches ?? []
  const role = organization.role
  const totalWarehouses = branches.reduce((acc, b) => acc + (b.warehouses?.length || 0), 0)

  const filteredBranches = branches.filter(
    (b) =>
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.code.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      {/* Header Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div className="flex items-center gap-3.5">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200/80 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-900/60 shadow-2xs">
            <Building2 className="size-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              Kelola Cabang &amp; Operasional
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">Lokasi cabang operasional, gudang terkait, dan integrasi kasir.</p>
          </div>
        </div>

        {role === "owner" && (
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-xs gap-2 h-9 px-4 rounded-xl"
            onClick={() => { setEditingId(undefined); setForm({ ...emptyForm }); setOpen(true) }}
          >
            <Plus className="size-4" /> Tambah Cabang
          </Button>
        )}
      </div>

      {/* Summary KPI Strip */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="py-4 border-t-2 border-t-emerald-500 shadow-sm">
          <CardContent className="px-5 py-0 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-muted-foreground">Total Cabang</p>
              <p className="text-2xl font-bold tracking-tight text-foreground mt-1">{branches.length}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Lokasi operasional aktif</p>
            </div>
            <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200/60 shadow-2xs">
              <Building2 className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="py-4 border-t-2 border-t-blue-500 shadow-sm">
          <CardContent className="px-5 py-0 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-muted-foreground">Total Gudang Terkait</p>
              <p className="text-2xl font-bold tracking-tight text-foreground mt-1">{totalWarehouses}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Penampungan stok inventaris</p>
            </div>
            <div className="flex size-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300 border border-blue-200/60 shadow-2xs">
              <Warehouse className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="py-4 border-t-2 border-t-amber-500 shadow-sm">
          <CardContent className="px-5 py-0 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-muted-foreground">Status Operasional</p>
              <p className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 mt-1">100% Aktif</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Terintegrasi dengan kasir POS</p>
            </div>
            <div className="flex size-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300 border border-amber-200/60 shadow-2xs">
              <CheckCircle2 className="size-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar Search */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama cabang atau kode..."
            className="pl-9 h-10 text-sm bg-background shadow-2xs rounded-xl"
          />
        </div>
      </div>

      {/* Branch Cards Grid */}
      {filteredBranches.length === 0 ? (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="flex min-h-[260px] flex-col items-center justify-center gap-3 text-center p-6">
            <Building2 className="size-10 text-muted-foreground/40" />
            <div>
              <p className="font-bold text-foreground text-base">Belum Ada Cabang</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                Tambahkan lokasi cabang pertama Anda untuk mulai mengelola stok dan transaksi kasir.
              </p>
            </div>
            {role === "owner" && (
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white mt-2 rounded-xl"
                onClick={() => { setEditingId(undefined); setForm({ ...emptyForm }); setOpen(true) }}
              >
                <Plus className="size-4 mr-1.5" /> Tambah Cabang Sekarang
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredBranches.map((branch) => (
            <Card
              key={branch.id}
              className="group relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md bg-card border border-t-2 border-t-emerald-500 shadow-2xs rounded-2xl flex flex-col justify-between"
            >
              <CardContent className="p-5 space-y-4">
                {/* Branch Name & Code Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400 border border-emerald-200/60 shadow-2xs font-bold">
                      <Building2 className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-base text-foreground truncate">{branch.name}</h3>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <span>Kode:</span>
                        <strong className="text-foreground">{branch.code}</strong>
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300 shrink-0 text-[10px] rounded-md font-semibold">
                    Aktif
                  </Badge>
                </div>

                {/* Warehouses Section */}
                <div className="rounded-xl bg-muted/40 p-3 space-y-2 border border-border/60 text-xs">
                  <div className="flex items-center justify-between text-muted-foreground font-medium text-[11px]">
                    <span className="flex items-center gap-1">
                      <Warehouse className="size-3.5 text-emerald-600" /> Gudang Terkait
                    </span>
                    <span>{branch.warehouses.length} Gudang</span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {branch.warehouses.length ? (
                      branch.warehouses.map((warehouse) => (
                        <Badge key={warehouse.id} variant="secondary" className="gap-1 text-[11px] py-0.5 px-2 bg-background border font-medium rounded-lg">
                          <Warehouse className="size-3 text-muted-foreground" /> {warehouse.name}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground italic">Belum ada gudang terhubung</span>
                    )}
                  </div>
                </div>

                {/* Actions Footer */}
                {role === "owner" && (
                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-dashed">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1.5 rounded-lg border-muted"
                      onClick={() => void loadBranchDetail(branch.id)}
                    >
                      <Pencil className="size-3.5 text-muted-foreground" /> Edit Detail
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg"
                      onClick={() => void deactivate(branch.id, branch.name)}
                    >
                      Nonaktifkan
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add / Edit Branch Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0 rounded-2xl overflow-hidden gap-0">
          <DialogHeader className="px-6 py-4 border-b shrink-0 bg-background text-left">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              {editingId ? <Pencil className="size-5 text-emerald-600" /> : <Plus className="size-5 text-emerald-600" />}{" "}
              {editingId ? "Edit Detail Cabang" : "Tambah Cabang Baru"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
              {editingId
                ? "Perbarui profil cabang dan foto QRIS pembayaran khusus cabang ini."
                : "Lengkapi data cabang baru serta konfigurasi QRIS kasir untuk cabang ini."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={save} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                {/* Left Column: Detail Informasi Cabang */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-1 border-b">
                    <Building2 className="size-4 text-emerald-600" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">Informasi Utama Cabang</h4>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="branch-name" className="text-xs font-semibold">Nama Cabang</Label>
                    <Input
                      id="branch-name"
                      value={form.name}
                      onChange={(event) => setForm({ ...form, name: event.target.value })}
                      placeholder="Contoh: Cabang Dago Bandung"
                      required
                      minLength={2}
                      className="h-10 text-sm rounded-xl"
                    />
                  </div>

                  {!editingId && (
                    <div className="space-y-2">
                      <Label htmlFor="branch-code" className="text-xs font-semibold">Kode Cabang</Label>
                      <Input
                        id="branch-code"
                        value={form.code}
                        onChange={(event) => setForm({ ...form, code: event.target.value })}
                        placeholder="Contoh: DAGO-01"
                        required
                        pattern="[A-Za-z0-9_-]+"
                        maxLength={20}
                        className="h-10 text-sm rounded-xl"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="branch-city" className="text-xs font-semibold">Kota</Label>
                      <Input
                        id="branch-city"
                        value={form.city}
                        onChange={(event) => setForm({ ...form, city: event.target.value })}
                        placeholder="Contoh: Bandung"
                        className="h-10 text-sm rounded-xl"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="branch-phone" className="text-xs font-semibold">Nomor Telepon</Label>
                      <Input
                        id="branch-phone"
                        value={form.phone}
                        onChange={(event) => setForm({ ...form, phone: event.target.value })}
                        placeholder="Contoh: 022-1234567"
                        className="h-10 text-sm rounded-xl"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="branch-address" className="text-xs font-semibold">Alamat Lengkap</Label>
                    <Input
                      id="branch-address"
                      value={form.address}
                      onChange={(event) => setForm({ ...form, address: event.target.value })}
                      placeholder="Contoh: Jl. Ir. H. Juanda No. 10"
                      className="h-10 text-sm rounded-xl"
                    />
                  </div>
                </div>

                {/* Right Column: Konfigurasi Pembayaran & QRIS Cabang */}
                <div className="space-y-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                  <div className="flex items-center justify-between pb-1 border-b border-emerald-500/20">
                    <div className="flex items-center gap-1.5 font-bold text-xs text-foreground">
                      <QrCode className="size-4 text-emerald-600" />
                      <span>Pembayaran &amp; QRIS Cabang</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] bg-background">
                      {form.paymentMode === "branch_midtrans"
                        ? "Midtrans Khusus Cabang"
                        : form.paymentMode === "manual_qris"
                        ? "QRIS Manual Cabang"
                        : "Otomatis Midtrans Toko"}
                    </Badge>
                  </div>

                  {/* Mode Selector */}
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold">Integrasi Gateway Pembayaran (Self-Order &amp; POS)</Label>
                    <Select
                      value={form.paymentMode}
                      onValueChange={(val: "inherit" | "branch_midtrans" | "manual_qris") =>
                        setForm({ ...form, paymentMode: val })
                      }
                    >
                      <SelectTrigger className="h-9 text-xs rounded-xl bg-background">
                        <SelectValue placeholder="Pilih Mode Pembayaran Cabang" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inherit">⚡ Otomatis Ikuti Midtrans Toko Utama (Disarankan)</SelectItem>
                        <SelectItem value="branch_midtrans">🏢 Akun Midtrans Khusus Cabang Ini (Kredensial Terpisah)</SelectItem>
                        <SelectItem value="manual_qris">📸 QRIS Manual Toko / Upload Foto QRIS</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Branch Midtrans Credentials */}
                  {form.paymentMode === "branch_midtrans" && (
                    <div className="space-y-2.5 p-3 rounded-xl bg-background border border-emerald-500/30">
                      <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                        <span>🔑 Kredensial Midtrans Khusus Cabang {form.name || ""}</span>
                      </div>
                      <div>
                        <Label htmlFor="branch-midtrans-server" className="text-[10px] font-semibold">
                          Server Key Midtrans Cabang
                        </Label>
                        <Input
                          id="branch-midtrans-server"
                          type="password"
                          value={form.midtransServerKey}
                          onChange={(e) => setForm({ ...form, midtransServerKey: e.target.value })}
                          placeholder={editingId ? "Kosongkan untuk mempertahankan key tersimpan" : "SB-Mid-server-xxxx... atau Mid-server-xxxx..."}
                          className="h-8 text-xs font-mono rounded-lg mt-0.5"
                        />
                      </div>
                      <div>
                        <Label htmlFor="branch-midtrans-client" className="text-[10px] font-semibold">
                          Client Key Midtrans Cabang (Opsional)
                        </Label>
                        <Input
                          id="branch-midtrans-client"
                          value={form.midtransClientKey}
                          onChange={(e) => setForm({ ...form, midtransClientKey: e.target.value })}
                          placeholder={editingId ? "Kosongkan untuk mempertahankan key tersimpan" : "SB-Mid-client-xxxx..."}
                          className="h-8 text-xs font-mono rounded-lg mt-0.5"
                        />
                      </div>
                    </div>
                  )}

                  {/* Upload QRIS Section */}
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    {form.qrisImageUrl ? (
                      <div className="relative group shrink-0">
                        <img
                          src={form.qrisImageUrl}
                          alt="QRIS Cabang"
                          className="size-28 object-contain rounded-xl border bg-white p-1.5 shadow-xs"
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          className="size-6 absolute -top-2 -right-2 rounded-full shadow-xs"
                          onClick={() => setForm({ ...form, qrisImageUrl: "" })}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center border-2 border-dashed border-emerald-500/30 hover:border-emerald-600 rounded-xl p-4 cursor-pointer bg-background w-full sm:w-32 h-28 text-center shrink-0 transition-colors">
                        <QrCode className="size-6 text-emerald-600 mb-1" />
                        <span className="text-[11px] font-bold text-foreground">Upload QRIS</span>
                        <span className="text-[9px] text-muted-foreground mt-0.5">PNG, JPG (Maks 2MB)</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg"
                          className="hidden"
                          onChange={handleBranchQrisUpload}
                        />
                      </label>
                    )}

                    <div className="flex-1 space-y-2.5 w-full">
                      <div>
                        <Label htmlFor="branch-qris-acc" className="text-[11px] font-semibold">
                          Nama Akun / Merchant QRIS
                        </Label>
                        <Input
                          id="branch-qris-acc"
                          value={form.qrisAccountName}
                          onChange={(e) => setForm({ ...form, qrisAccountName: e.target.value })}
                          placeholder="Contoh: BLANQ DAGO BANDUNG"
                          className="h-8 text-xs rounded-xl mt-0.5"
                        />
                      </div>
                      <div>
                        <Label htmlFor="branch-qris-inst" className="text-[11px] font-semibold">
                          Petunjuk Pembayaran Pelanggan
                        </Label>
                        <Input
                          id="branch-qris-inst"
                          value={form.qrisInstructions}
                          onChange={(e) => setForm({ ...form, qrisInstructions: e.target.value })}
                          placeholder="Contoh: Scan QRIS via BCA / GoPay / ShopeePay"
                          className="h-8 text-xs rounded-xl mt-0.5"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl bg-background/80 p-3 border text-[11px] text-muted-foreground leading-relaxed">
                    💡 <strong>Otomatis &amp; Real-Time:</strong> Jika Midtrans aktif, nominal pembayaran Self-Order Meja &amp; Langganan otomatis terkunci secara presisi dan terverifikasi instan tanpa perlu approval manual.
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="px-6 py-3.5 border-t bg-muted/20 shrink-0 flex items-center justify-end gap-2">
              <Button type="button" variant="outline" className="rounded-xl h-9" onClick={() => setOpen(false)}>
                Batal
              </Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-9 font-semibold" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="size-4 animate-spin mr-1" /> Menyimpan...
                  </>
                ) : editingId ? (
                  "Simpan Perubahan"
                ) : (
                  "Tambah Cabang"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
