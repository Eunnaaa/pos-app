"use client"

import { useCallback, useEffect, useState } from "react"
import { Building2, Landmark, Loader2, MapPin, Phone, Store } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useOrganization } from "@/components/kasir/organization-provider"
import { apiFetch } from "@/lib/client"
import { showError, showSuccess } from "@/lib/toast-handler"

type OrgProfile = { name: string; legalName: string | null; taxId: string | null; defaultCurrency: string; timezone: string; locale: string }

export function SettingsPage() {
  const { organization, refresh } = useOrganization()
  const [phone, setPhone] = useState("")
  const [saving, setSaving] = useState(false)
  const [orgForm, setOrgForm] = useState<OrgProfile>({ name: "", legalName: "", taxId: "", defaultCurrency: "IDR", timezone: "Asia/Jakarta", locale: "id-ID" })
  const [orgSaving, setOrgSaving] = useState(false)

  const loadProfile = useCallback(async () => {
    try {
      const [profileRes, orgRes] = await Promise.all([
        apiFetch<{ phone: string | null }>("/api/v1/settings/profile"),
        apiFetch<OrgProfile>("/api/v1/settings/organization"),
      ])
      setPhone(profileRes.data.phone ?? "")
      setOrgForm({
        name: orgRes.data.name || "",
        legalName: orgRes.data.legalName || "",
        taxId: orgRes.data.taxId || "",
        defaultCurrency: orgRes.data.defaultCurrency || "IDR",
        timezone: orgRes.data.timezone || "Asia/Jakarta",
        locale: orgRes.data.locale || "id-ID",
      })
    } catch (error) { showError(error instanceof Error ? error.message : "Gagal memuat profil") }
  }, [])

  useEffect(() => { void loadProfile() }, [loadProfile])

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault(); setSaving(true)
    try {
      await apiFetch("/api/v1/settings/profile", { method: "PUT", body: JSON.stringify({ phone: phone || null }) })
      showSuccess("Profil Owner disimpan")
    } catch (error) { showError(error instanceof Error ? error.message : "Gagal menyimpan profil") }
    finally { setSaving(false) }
  }

  async function saveOrg(event: React.FormEvent) {
    event.preventDefault(); setOrgSaving(true)
    try {
      await apiFetch("/api/v1/settings/organization", { method: "PATCH", body: JSON.stringify(orgForm) })
      showSuccess("Profil bisnis disimpan")
      await refresh()
    } catch (error) { showError(error instanceof Error ? error.message : "Gagal menyimpan profil bisnis") }
    finally { setOrgSaving(false) }
  }

  if (!organization) return null

  const branchCount = organization.branches.length
  const warehouseCount = organization.branches.reduce((sum, branch) => sum + branch.warehouses.length, 0)

  return (
    <div className="flex flex-1 flex-col gap-5 p-4 md:p-6">
      <div>
        <h2 className="text-2xl font-bold">Pengaturan</h2>
        <p className="text-sm text-muted-foreground">Konfigurasi bisnis dan informasi toko.</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="p-5"><div className="flex size-11 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950"><Store className="size-5 text-emerald-600" /></div><p className="mt-4 text-sm text-muted-foreground">Nama bisnis</p><p className="mt-1 truncate text-lg font-bold">{organization.name}</p></CardContent></Card>
        <Card><CardContent className="p-5"><div className="flex size-11 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-950"><Landmark className="size-5 text-blue-600" /></div><p className="mt-4 text-sm text-muted-foreground">Slug</p><p className="mt-1 truncate text-lg font-bold">{organization.slug}</p></CardContent></Card>
        <Card><CardContent className="p-5"><div className="flex size-11 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-950"><Store className="size-5 text-violet-600" /></div><p className="mt-4 text-sm text-muted-foreground">Cabang</p><p className="mt-1 text-lg font-bold">{branchCount}</p></CardContent></Card>
        <Card><CardContent className="p-5"><div className="flex size-11 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-950"><MapPin className="size-5 text-amber-600" /></div><p className="mt-4 text-sm text-muted-foreground">Gudang</p><p className="mt-1 text-lg font-bold">{warehouseCount}</p></CardContent></Card>
      </section>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Phone className="size-4 text-emerald-600" /> Profil Owner</CardTitle><CardDescription>Nomor WhatsApp Owner untuk menerima laporan shift kasir.</CardDescription></CardHeader>
        <CardContent>
          <form onSubmit={saveProfile} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="owner-phone">Nomor WhatsApp Owner</Label>
              <Input id="owner-phone" placeholder="+6281234567890" value={phone} onChange={(event) => setPhone(event.target.value)} />
            </div>
            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="size-4 text-emerald-600" /> Profil Bisnis</CardTitle><CardDescription>Informasi legal dan konfigurasi toko.</CardDescription></CardHeader>
        <CardContent>
          <form onSubmit={saveOrg} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="org-name">Nama bisnis</Label><Input id="org-name" value={orgForm.name} onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })} required /></div>
            <div className="space-y-2"><Label htmlFor="org-legal">Nama legal</Label><Input id="org-legal" value={orgForm.legalName ?? ""} onChange={(e) => setOrgForm({ ...orgForm, legalName: e.target.value })} placeholder="PT Kopi Senja Mandiri" /></div>
            <div className="space-y-2"><Label htmlFor="org-tax">NPWP / Tax ID</Label><Input id="org-tax" value={orgForm.taxId ?? ""} onChange={(e) => setOrgForm({ ...orgForm, taxId: e.target.value })} placeholder="01.234.567.8-901.000" /></div>
            <div className="space-y-2"><Label htmlFor="org-currency">Mata uang</Label><Input id="org-currency" value={orgForm.defaultCurrency} onChange={(e) => setOrgForm({ ...orgForm, defaultCurrency: e.target.value })} placeholder="IDR" /></div>
            <div className="space-y-2"><Label htmlFor="org-tz">Zona waktu</Label><Input id="org-tz" value={orgForm.timezone} onChange={(e) => setOrgForm({ ...orgForm, timezone: e.target.value })} placeholder="Asia/Jakarta" /></div>
            <div className="space-y-2"><Label htmlFor="org-locale">Locale</Label><Input id="org-locale" value={orgForm.locale} onChange={(e) => setOrgForm({ ...orgForm, locale: e.target.value })} placeholder="id-ID" /></div>
            <div className="sm:col-span-2"><Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={orgSaving}>{orgSaving ? <><Loader2 className="size-4 animate-spin" /> Menyimpan...</> : "Simpan profil bisnis"}</Button></div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Store className="size-4 text-emerald-600" /> Daftar cabang</CardTitle><CardDescription>Lokasi operasional organisasi.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {organization.branches.map((branch) => (
            <div key={branch.id} className="flex items-center justify-between gap-3 rounded-xl border p-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium"><Store className="size-4 text-muted-foreground" /> {branch.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">Kode {branch.code} • {branch.warehouses.length} gudang</p>
              </div>
              <Badge variant="outline" className="shrink-0">{branch.warehouses.map((w) => w.name).join(", ") || "Belum ada gudang"}</Badge>
            </div>
          ))}
          {!organization.branches.length && <p className="py-8 text-center text-sm text-muted-foreground">Belum ada cabang.</p>}
        </CardContent>
      </Card>
    </div>
  )
}