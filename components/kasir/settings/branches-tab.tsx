"use client"

import { useState } from "react"
import { Loader2, MapPin, Pencil, Plus, Store, Warehouse } from "lucide-react"
import { useOrganization } from "@/components/kasir/organization-provider"
import { apiFetch } from "@/lib/client"
import { showError, showSuccess } from "@/lib/toast-handler"
import { useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type BranchDetail = { id: string; name: string; code: string; phone?: string; email?: string; address?: string; city?: string; province?: string; postal_code?: string; is_active: boolean }

const emptyForm = { name: "", code: "", city: "", phone: "", email: "", address: "" }

export function BranchesTab() {
  const t = useTranslations("BranchesTab")
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
        email: branch.email || "",
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
    setSaving(true)
    try {
      if (editingId) {
        await apiFetch(`/api/v1/branches/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: form.name.trim(),
            city: form.city.trim() || undefined,
            phone: form.phone.trim() || undefined,
            email: form.email.trim() || undefined,
            address: form.address.trim() || undefined,
          }),
        })
        showSuccess(t("updated"))
      } else {
        if (!form.code) {
          showError(t("codeRequired"))
          setSaving(false)
          return
        }
        await apiFetch("/api/v1/branches", {
          method: "POST",
          body: JSON.stringify({
            name: form.name.trim(),
            code: form.code.trim().toUpperCase(),
            city: form.city.trim() || undefined,
            phone: form.phone.trim() || undefined,
            email: form.email.trim() || undefined,
            address: form.address.trim() || undefined,
          }),
        })
        showSuccess(`${t("createdPrefix")} ${form.name} ${t("createdSuffix")}`)
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
    if (!confirm(`${t("deactivateConfirmPrefix")}${name}${t("deactivateConfirmSuffix")}`)) return
    try {
      await apiFetch(`/api/v1/branches/${id}`, { method: "DELETE" })
      showSuccess(`${t("createdPrefix")} ${name} ${t("deactivated")}`)
      await refresh()
      window.dispatchEvent(new Event("kedai-ku-context-change"))
    } catch (error) {
      showError(error instanceof Error ? error.message : "Gagal menonaktifkan cabang")
    }
  }

  if (!organization) return null

  const branches = organization.branches ?? []
  const isOwner = organization.role === "owner"

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Store className="size-5 text-emerald-600" /> {t("title")}</CardTitle>
            <p className="text-sm text-muted-foreground">{t("desc")}</p>
          </div>
          {isOwner && (
            <Button className="bg-emerald-600 hover:bg-emerald-700 shrink-0" onClick={() => { setEditingId(undefined); setForm({ ...emptyForm }); setOpen(true) }}>
              <Plus className="size-4" /> {t("add")}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {branches.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            branches.map((branch) => (
              <div key={branch.id} className="flex items-center justify-between gap-3 rounded-xl border p-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium"><MapPin className="size-4 text-muted-foreground" /> {branch.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("code")} {branch.code} • {branch.warehouses.length} {t("warehouses")}
                  </p>
                  {branch.warehouses.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {branch.warehouses.map((w) => (
                        <Badge key={w.id} variant="secondary" className="gap-1"><Warehouse className="size-3" />{w.name}</Badge>
                      ))}
                    </div>
                  )}
                </div>
                {isOwner && (
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="sm" onClick={() => void loadBranchDetail(branch.id)}><Pencil className="size-3.5" /> {t("edit")}</Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => void deactivate(branch.id, branch.name)}>{t("deactivate")}</Button>
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">{editingId ? <Pencil className="size-4 text-emerald-600" /> : <Plus className="size-4 text-emerald-600" />} {editingId ? t("editTitle") : t("addTitle")}</DialogTitle>
            {!editingId && <DialogDescription>{t("addDesc")}</DialogDescription>}
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="branch-name">{t("name")}</Label>
              <Input id="branch-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={t("namePlaceholder")} required minLength={2} />
            </div>
            {!editingId && (
              <div className="space-y-2">
                <Label htmlFor="branch-code">{t("codeLabel")}</Label>
                <Input id="branch-code" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder={t("codePlaceholder")} required pattern="[A-Za-z0-9_-]+" maxLength={20} />
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="branch-city">{t("city")}</Label>
                <Input id="branch-city" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} placeholder={t("cityPlaceholder")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="branch-phone">{t("phone")}</Label>
                <Input id="branch-phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder={t("phonePlaceholder")} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch-email">{t("email")}</Label>
              <Input id="branch-email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder={t("emailPlaceholder")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch-address">{t("address")}</Label>
              <Input id="branch-address" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder={t("addressPlaceholder")} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={saving}>
                {saving ? <><Loader2 className="size-4 animate-spin" /> Menyimpan...</> : editingId ? t("saveEdit") : t("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}