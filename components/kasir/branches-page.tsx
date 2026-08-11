"use client"

import { useState } from "react"
import { Building2, Loader2, Pencil, Plus, Warehouse } from "lucide-react"
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
      window.dispatchEvent(new Event("kasir-ku-context-change"))
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
      window.dispatchEvent(new Event("kasir-ku-context-change"))
    } catch (error) {
      showError(error instanceof Error ? error.message : "Gagal menonaktifkan cabang")
    }
  }

  if (!organization) return null

  const branches = organization.branches ?? []
  const role = organization.role

  return (
    <div className="flex flex-1 flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <Building2 className="size-5" />
          </span>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Cabang &amp; Gudang</h2>
            <p className="text-sm text-muted-foreground">Kelola lokasi operasional organisasi. Setiap cabang otomatis mendapat satu gudang dan mesin kasir.</p>
          </div>
        </div>
        {role === "owner" && (
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { setEditingId(undefined); setForm({ ...emptyForm }); setOpen(true) }}>
            <Plus className="size-4" /> Tambah cabang
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-5">
          {branches.length === 0 ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 text-center">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-muted"><Building2 className="size-7 text-muted-foreground" /></span>
              <div>
                <p className="font-semibold">Belum ada cabang</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">Tambahkan cabang pertama melalui tombol tambah.</p>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {branches.map((branch) => (
                <Card key={branch.id} className="rounded-xl border">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold">{branch.name}</p>
                      <Badge variant="outline" className="shrink-0">Kode {branch.code}</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {branch.warehouses.length ? (
                        branch.warehouses.map((warehouse) => (
                          <Badge key={warehouse.id} variant="secondary" className="gap-1"><Warehouse className="size-3" />{warehouse.name}</Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">Belum ada gudang</span>
                      )}
                    </div>
                    {role === "owner" && (
                      <div className="mt-3 flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => void loadBranchDetail(branch.id)}><Pencil className="size-3.5" /> Edit</Button>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => void deactivate(branch.id, branch.name)}>Nonaktifkan</Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">{editingId ? <Pencil className="size-4 text-emerald-600" /> : <Plus className="size-4 text-emerald-600" />} {editingId ? "Edit cabang" : "Tambah cabang"}</DialogTitle>
            {!editingId && <DialogDescription>Gudang default dan mesin kasir untuk cabang ini akan dibuat otomatis.</DialogDescription>}
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="branch-name">Nama cabang</Label>
              <Input id="branch-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Cafe Senja" required minLength={2} />
            </div>
            {!editingId && (
              <div className="space-y-2">
                <Label htmlFor="branch-code">Kode cabang</Label>
                <Input id="branch-code" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder="SENJA" required pattern="[A-Za-z0-9_-]+" maxLength={20} />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="branch-city">Kota</Label>
              <Input id="branch-city" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} placeholder="Bandung" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch-phone">Telepon</Label>
              <Input id="branch-phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="022-1234567" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch-address">Alamat</Label>
              <Input id="branch-address" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="Jl. Merdeka No. 10" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={saving}>
                {saving ? <><Loader2 className="size-4 animate-spin" /> Menyimpan...</> : editingId ? "Simpan" : "Simpan cabang"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
