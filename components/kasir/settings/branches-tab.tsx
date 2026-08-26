"use client"

import { useState } from "react"
import { Loader2, MapPin, Pencil, Plus, QrCode, Store, Trash2, Warehouse } from "lucide-react"
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
  email: "",
  address: "",
  qrisImageUrl: "",
  qrisAccountName: "",
  qrisInstructions: "",
}

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
      const meta = (branch.metadata || {}) as Record<string, unknown>
      setForm({
        name: branch.name || "",
        code: branch.code || "",
        city: branch.city || "",
        phone: branch.phone || "",
        email: branch.email || "",
        address: branch.address || "",
        qrisImageUrl: (branch.qrisImageUrl || meta.qrisImageUrl || "") as string,
        qrisAccountName: (branch.qrisAccountName || meta.qrisAccountName || "") as string,
        qrisInstructions: (branch.qrisInstructions || meta.qrisInstructions || "") as string,
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
            qrisImageUrl: form.qrisImageUrl || null,
            qrisAccountName: form.qrisAccountName.trim() || null,
            qrisInstructions: form.qrisInstructions.trim() || null,
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
            qrisImageUrl: form.qrisImageUrl || null,
            qrisAccountName: form.qrisAccountName.trim() || null,
            qrisInstructions: form.qrisInstructions.trim() || null,
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
        <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0 rounded-2xl overflow-hidden gap-0">
          <DialogHeader className="px-6 py-4 border-b shrink-0 bg-background text-left">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              {editingId ? <Pencil className="size-5 text-emerald-600" /> : <Plus className="size-5 text-emerald-600" />}{" "}
              {editingId ? t("editTitle") : t("addTitle")}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
              {editingId
                ? "Perbarui profil cabang dan foto QRIS pembayaran khusus cabang ini."
                : t("addDesc")}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={save} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                {/* Left Column: Detail Informasi Cabang */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-1 border-b">
                    <Store className="size-4 text-emerald-600" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">Informasi Utama Cabang</h4>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="branch-name" className="text-xs font-semibold">{t("name")}</Label>
                    <Input id="branch-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={t("namePlaceholder")} required minLength={2} className="h-10 text-sm rounded-xl" />
                  </div>

                  {!editingId && (
                    <div className="space-y-2">
                      <Label htmlFor="branch-code" className="text-xs font-semibold">{t("codeLabel")}</Label>
                      <Input id="branch-code" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder={t("codePlaceholder")} required pattern="[A-Za-z0-9_-]+" maxLength={20} className="h-10 text-sm rounded-xl" />
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="branch-city" className="text-xs font-semibold">{t("city")}</Label>
                      <Input id="branch-city" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} placeholder={t("cityPlaceholder")} className="h-10 text-sm rounded-xl" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="branch-phone" className="text-xs font-semibold">{t("phone")}</Label>
                      <Input id="branch-phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder={t("phonePlaceholder")} className="h-10 text-sm rounded-xl" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="branch-email" className="text-xs font-semibold">{t("email")}</Label>
                    <Input id="branch-email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder={t("emailPlaceholder")} className="h-10 text-sm rounded-xl" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="branch-address" className="text-xs font-semibold">{t("address")}</Label>
                    <Input id="branch-address" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder={t("addressPlaceholder")} className="h-10 text-sm rounded-xl" />
                  </div>
                </div>

                {/* Right Column: QRIS Khusus Cabang */}
                <div className="space-y-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                  <div className="flex items-center justify-between pb-1 border-b border-emerald-500/20">
                    <div className="flex items-center gap-1.5 font-bold text-xs text-foreground">
                      <QrCode className="size-4 text-emerald-600" />
                      <span>Foto QRIS Khusus Cabang</span>
                    </div>
                    {form.qrisImageUrl ? (
                      <Badge className="bg-emerald-600 text-white text-[10px]">QRIS Cabang Aktif</Badge>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">Default: QRIS Toko</span>
                    )}
                  </div>

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
                          accept="image/*"
                          className="hidden"
                          onChange={handleBranchQrisUpload}
                        />
                      </label>
                    )}

                    <div className="flex-1 space-y-3 w-full">
                      <div>
                        <Label htmlFor="branch-tab-qris-acc" className="text-[11px] font-semibold">
                          Nama Akun di QRIS Cabang
                        </Label>
                        <Input
                          id="branch-tab-qris-acc"
                          value={form.qrisAccountName}
                          onChange={(e) => setForm({ ...form, qrisAccountName: e.target.value })}
                          placeholder="Contoh: BLANQ DAGO BANDUNG"
                          className="h-9 text-xs rounded-xl mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="branch-tab-qris-inst" className="text-[11px] font-semibold">
                          Petunjuk Pembayaran Kasir
                        </Label>
                        <Input
                          id="branch-tab-qris-inst"
                          value={form.qrisInstructions}
                          onChange={(e) => setForm({ ...form, qrisInstructions: e.target.value })}
                          placeholder="Contoh: Scan via BCA / GoPay Cabang Dago"
                          className="h-9 text-xs rounded-xl mt-1"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl bg-background/80 p-3 border text-[11px] text-muted-foreground leading-relaxed">
                    💡 <strong>Multi-Tenant Fallback:</strong> Jika foto QRIS cabang ini dikosongkan, kasir di cabang ini otomatis memakai QRIS default toko dari <em>Pengaturan Bisnis</em>.
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="px-6 py-3.5 border-t bg-muted/20 shrink-0 flex items-center justify-end gap-2">
              <Button type="button" variant="outline" className="rounded-xl h-9" onClick={() => setOpen(false)}>Batal</Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 font-bold text-white rounded-xl h-9" disabled={saving}>
                {saving ? <><Loader2 className="size-4 animate-spin mr-1" /> Menyimpan...</> : editingId ? t("saveEdit") : t("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}