"use client"

import { useCallback, useEffect, useState } from "react"
import { Building2, Loader2, Upload } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useOrganization } from "@/components/kasir/organization-provider"
import { apiFetch } from "@/lib/client"
import { showError, showSuccess } from "@/lib/toast-handler"
import { useTranslations } from "next-intl"

type OrgProfile = {
  id: string
  name: string
  slug: string
  legalName: string | null
  taxId: string | null
  phone: string | null
  email: string | null
  address: string | null
  logoUrl: string | null
  description: string | null
  defaultCurrency: string
  timezone: string
  locale: string
}

export function BusinessTab() {
  const t = useTranslations("BusinessTab")
  const { organization, refresh } = useOrganization()
  const [form, setForm] = useState<OrgProfile>({
    id: "",
    name: "",
    slug: "",
    legalName: "",
    taxId: "",
    phone: "",
    email: "",
    address: "",
    logoUrl: "",
    description: "",
    defaultCurrency: "IDR",
    timezone: "Asia/Jakarta",
    locale: "id-ID",
  })
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  const loadOrg = useCallback(async () => {
    try {
      const res = await apiFetch<OrgProfile>("/api/v1/settings/organization")
      const d = res.data
      setForm({
        id: d.id,
        name: d.name || "",
        slug: d.slug || "",
        legalName: d.legalName || "",
        taxId: d.taxId || "",
        phone: d.phone || "",
        email: d.email || "",
        address: d.address || "",
        logoUrl: d.logoUrl || "",
        description: d.description || "",
        defaultCurrency: d.defaultCurrency || "IDR",
        timezone: d.timezone || "Asia/Jakarta",
        locale: d.locale || "id-ID",
      })
    } catch (error) {
      showError(error instanceof Error ? error.message : "Gagal memuat profil organisasi")
    }
  }, [])

  useEffect(() => {
    void loadOrg()
  }, [loadOrg])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await apiFetch("/api/v1/settings/organization", {
        method: "PATCH",
        body: JSON.stringify({
          name: form.name.trim(),
          slug: form.slug.trim().toLowerCase(),
          legalName: form.legalName?.trim() || null,
          taxId: form.taxId?.trim() || null,
          phone: form.phone?.trim() || null,
          email: form.email?.trim() || null,
          address: form.address?.trim() || null,
          description: form.description?.trim() || null,
          defaultCurrency: form.defaultCurrency.trim(),
          timezone: form.timezone.trim(),
          locale: form.locale.trim(),
        }),
      })
      showSuccess(t("saved"))
      await refresh()
    } catch (error) {
      showError(error instanceof Error ? error.message : "Gagal menyimpan profil bisnis")
    } finally {
      setSaving(false)
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      showError("Ukuran logo maksimal 2MB")
      return
    }
    setUploadingLogo(true)
    try {
      const res = await fetch("/api/v1/settings/organization/logo", {
        method: "POST",
        headers: { "content-type": file.type },
        credentials: "include",
        body: await file.arrayBuffer(),
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error?.message || "Gagal mengunggah logo")
      setForm((prev) => ({ ...prev, logoUrl: payload.data.logoUrl }))
      showSuccess(t("logoUpdated"))
      await refresh()
    } catch (error) {
      showError(error instanceof Error ? error.message : "Gagal mengunggah logo")
    } finally {
      setUploadingLogo(false)
    }
  }

  if (!organization) return null
  const isOwner = organization.role === "owner"

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Building2 className="size-5 text-emerald-600" /> {t("title")}</CardTitle>
          <CardDescription>{t("desc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <div className="flex size-20 items-center justify-center rounded-xl border bg-muted overflow-hidden">
              {form.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.logoUrl} alt="Logo Toko" className="size-full object-contain p-1" />
              ) : (
                <Building2 className="size-8 text-muted-foreground" />
              )}
            </div>
            {isOwner && (
              <div className="flex flex-col items-center sm:items-start">
                <Label htmlFor="logo-file" className="cursor-pointer">
                  <span className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted">
                    {uploadingLogo ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                    {uploadingLogo ? "Mengunggah..." : t("changeLogo")}
                  </span>
                </Label>
                <Input id="logo-file" type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={uploadingLogo} />
                <p className="mt-1 text-xs text-muted-foreground">{t("logoHint")}</p>
              </div>
            )}
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="org-name">{t("name")}</Label>
                <Input id="org-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} disabled={!isOwner} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="org-slug">{t("slug")}</Label>
                <div className="relative">
                  <Input id="org-slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" className="pr-24" disabled={!isOwner} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">.kedai-ku.id</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="org-legal">{t("legalName")}</Label>
                <Input id="org-legal" value={form.legalName ?? ""} onChange={(e) => setForm({ ...form, legalName: e.target.value })} placeholder={t("legalPlaceholder")} disabled={!isOwner} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="org-tax">{t("taxId")}</Label>
                <Input id="org-tax" value={form.taxId ?? ""} onChange={(e) => setForm({ ...form, taxId: e.target.value })} placeholder={t("taxPlaceholder")} disabled={!isOwner} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="org-phone">{t("phone")}</Label>
                <Input id="org-phone" value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder={t("phonePlaceholder")} disabled={!isOwner} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="org-email">{t("email")}</Label>
                <Input id="org-email" type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder={t("emailPlaceholder")} disabled={!isOwner} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="org-address">{t("address")}</Label>
              <Textarea id="org-address" value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder={t("addressPlaceholder")} rows={2} disabled={!isOwner} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="org-desc">{t("description")}</Label>
              <Textarea id="org-desc" value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t("descriptionPlaceholder")} rows={2} disabled={!isOwner} />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="org-currency">{t("currency")}</Label>
                <Input id="org-currency" value={form.defaultCurrency} onChange={(e) => setForm({ ...form, defaultCurrency: e.target.value })} placeholder="IDR" disabled={!isOwner} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="org-tz">{t("timezone")}</Label>
                <Input id="org-tz" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} placeholder="Asia/Jakarta" disabled={!isOwner} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="org-locale">{t("locale")}</Label>
                <Input id="org-locale" value={form.locale} onChange={(e) => setForm({ ...form, locale: e.target.value })} placeholder="id-ID" disabled={!isOwner} />
              </div>
            </div>

            {isOwner && (
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={saving}>
                {saving ? <><Loader2 className="size-4 animate-spin" /> Menyimpan...</> : t("save")}
              </Button>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}