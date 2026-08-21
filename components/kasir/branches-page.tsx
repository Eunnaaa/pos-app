"use client"

import { useState } from "react"
import {
  Building2,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  Search,
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

type BranchDetail = { id: string; name: string; code: string; phone?: string; email?: string; address?: string; city?: string; province?: string; postal_code?: string; is_active: boolean }
const emptyForm = { name: "", code: "", city: "", phone: "", address: "" }

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
      setForm({
        name: branch.name || "",
        code: branch.code || "",
        city: branch.city || "",
        phone: branch.phone || "",
        address: branch.address || "",
      })
      setEditingId(id)
      setOpen(true)
    } catch (error) {
      showError(error instanceof Error ? error.message : "Gagal memuat detail cabang")
    }
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
          }),
        })
        showSuccess("Cabang diperbarui")
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
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="rounded-2xl border border-t-2 border-t-emerald-500 bg-card shadow-2xs transition-all hover:shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-foreground/80">Total Cabang</p>
              <p className="text-2xl font-extrabold tracking-tight text-foreground mt-1">{branches.length}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Lokasi operasional aktif</p>
            </div>
            <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200/60 shadow-2xs">
              <Building2 className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-t-2 border-t-blue-500 bg-card shadow-2xs transition-all hover:shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-foreground/80">Total Gudang Terkait</p>
              <p className="text-2xl font-extrabold tracking-tight text-foreground mt-1">{totalWarehouses}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Penampungan stok inventaris</p>
            </div>
            <div className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300 border border-blue-200/60 shadow-2xs">
              <Warehouse className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-t-2 border-t-amber-500 bg-card shadow-2xs transition-all hover:shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-foreground/80">Status Operasional</p>
              <p className="text-2xl font-extrabold tracking-tight text-emerald-600 dark:text-emerald-400 mt-1">100% Aktif</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Terintegrasi dengan kasir POS</p>
            </div>
            <div className="flex size-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300 border border-amber-200/60 shadow-2xs">
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
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              {editingId ? <Pencil className="size-5 text-emerald-600" /> : <Plus className="size-5 text-emerald-600" />}{" "}
              {editingId ? "Edit Detail Cabang" : "Tambah Cabang Baru"}
            </DialogTitle>
            {!editingId && (
              <DialogDescription className="text-xs">
                Gudang default dan mesin kasir untuk cabang ini akan dibuat secara otomatis.
              </DialogDescription>
            )}
          </DialogHeader>

          <form onSubmit={save} className="space-y-4 pt-2">
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

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" className="rounded-xl h-9" onClick={() => setOpen(false)}>
                Batal
              </Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-9 font-semibold" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Menyimpan...
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
