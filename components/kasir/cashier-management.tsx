"use client"

import { useCallback, useEffect, useState } from "react"
import { useOrganization } from "@/components/kasir/organization-provider"
import { apiFetch } from "@/lib/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { showError, showSuccess } from "@/lib/toast-handler"
import { Loader2, Pencil, UserX } from "lucide-react"

type Cashier = {
  id: string
  user_id: string
  name: string
  email: string
  is_active: boolean
  branch_ids: string[]
}

export function CashierManagement() {
  const { organization } = useOrganization()
  const [cashiers, setCashiers] = useState<Cashier[]>([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<Cashier | undefined>()
  const [form, setForm] = useState({ name: "", email: "", password: "", branchIds: [] as string[] })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await apiFetch<Cashier[]>("/api/v1/cashiers")
      setCashiers(response.data)
    } catch (error) {
      showError(error instanceof Error ? error.message : "Gagal memuat cashier", { error })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  function showEdit(cashier: Cashier) {
    setEditing(cashier)
    setForm({ name: cashier.name, email: cashier.email, password: "", branchIds: cashier.branch_ids || [] })
  }

  function toggleBranch(id: string, checked: boolean) {
    setForm((current) => ({ ...current, branchIds: checked ? [...current.branchIds, id] : current.branchIds.filter((branchId) => branchId !== id) }))
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      if (editing) {
        await apiFetch(`/api/v1/cashiers/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: form.name, branchIds: form.branchIds }),
        })
        showSuccess("Cashier diperbarui")
      } else {
        await apiFetch("/api/v1/cashiers", {
          method: "POST",
          body: JSON.stringify(form),
        })
        showSuccess("Cashier dibuat")
      }
      setEditing(undefined)
      setForm({ name: "", email: "", password: "", branchIds: [] })
      await load()
    } catch (error) {
      showError(error instanceof Error ? error.message : "Gagal menyimpan cashier")
    } finally {
      setSaving(false)
    }
  }

  async function deactivate(cashier: Cashier) {
    if (!confirm(`Nonaktifkan cashier "${cashier.name}"?`)) return
    try {
      await apiFetch(`/api/v1/cashiers/${cashier.id}`, { method: "DELETE" })
      showSuccess("Cashier dinonaktifkan")
      await load()
    } catch (error) {
      showError(error instanceof Error ? error.message : "Gagal menonaktifkan cashier")
    }
  }

  const branchName = (id: string) => organization?.branches.find((b) => b.id === id)?.name

  return (
    <div className="flex flex-1 flex-col gap-5 p-4 md:p-6">
      <div>
        <h2 className="text-2xl font-bold">Manajemen Akun Kasir</h2>
        <p className="text-sm text-muted-foreground">Buat akun staf kasir Kedai-Ku dan tentukan hak akses penugasan cabang.</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader><CardTitle>{editing ? "Edit Akun Kasir" : "Tambah Akun Kasir"}</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={save} className="space-y-4">
              <div><Label>Nama Lengkap</Label><Input required minLength={2} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Nama staf kasir" /></div>
              {!editing && (
                <>
                  <div><Label>Email</Label><Input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="kasir@kedaiku.com" /></div>
                  <div><Label>Password Awal</Label><Input required minLength={12} type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Minimal 12 karakter" /></div>
                </>
              )}
              <div>
                <Label>Penugasan Cabang (opsional — default semua cabang)</Label>
                {organization?.branches.map((branch) => (
                  <label key={branch.id} className="flex items-center gap-2 py-2 text-sm">
                    <Checkbox checked={form.branchIds.includes(branch.id)} onCheckedChange={(checked) => toggleBranch(branch.id, checked === true)} />
                    {branch.name}
                  </label>
                ))}
                {!organization?.branches.length && <p className="text-sm text-muted-foreground">Belum ada cabang terdaftar.</p>}
              </div>
              <Button disabled={saving} className="w-full bg-emerald-600 hover:bg-emerald-700">
                {saving ? <Loader2 className="size-4 animate-spin" /> : editing ? "Simpan Perubahan" : "Buat Akun Kasir"}
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Daftar Kasir Terdaftar</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {loading && <div className="flex h-20 items-center justify-center"><Loader2 className="size-5 animate-spin text-emerald-600" /></div>}
            {cashiers.map((cashier) => (
              <div key={cashier.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{cashier.name}</p>
                    <p className="text-sm text-muted-foreground">{cashier.email}</p>
                    {cashier.branch_ids?.length > 0 ? (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {cashier.branch_ids.map((id) => <Badge key={id} variant="secondary" className="text-xs">{branchName(id) || id.slice(0, 8)}</Badge>)}
                      </div>
                    ) : <p className="mt-1 text-xs text-muted-foreground">Semua cabang</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={cashier.is_active ? "default" : "outline"} className={cashier.is_active ? "bg-emerald-600" : ""}>{cashier.is_active ? "Aktif" : "Nonaktif"}</Badge>
                    <Button variant="ghost" size="icon" onClick={() => showEdit(cashier)}><Pencil className="size-4" /></Button>
                    {cashier.is_active && <Button variant="ghost" size="icon" className="text-destructive" onClick={() => void deactivate(cashier)}><UserX className="size-4" /></Button>}
                  </div>
                </div>
              </div>
            ))}
            {!loading && !cashiers.length && <p className="text-sm text-muted-foreground">Belum ada cashier.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
