"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Building2, Loader2, Store } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LanguageToggle } from "@/components/language-toggle"
import { persistActiveContext } from "@/lib/client"
import { useRouter } from "@/i18n/navigation"
import { showSuccess } from "@/lib/toast-handler"

export default function OnboardingPage() {
  const t = useTranslations("Onboarding")
  const router = useRouter()
  const [form, setForm] = useState({ businessName: "", slug: "", branchName: t("branchPlaceholder") })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  function update(field: keyof typeof form) {
    return (event: React.ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, [field]: event.target.value }))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(""); setLoading(true)
    try {
      const response = await fetch("/api/v1/onboarding", { method: "POST", headers: { "content-type": "application/json" }, credentials: "include", body: JSON.stringify(form) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error?.message || t("failed"))
      persistActiveContext({ organizationId: payload.data.organization.id, branchId: payload.data.branch.id, warehouseId: payload.data.warehouse.id })
      showSuccess(t("storeReady"))
      router.replace("/dashboard")
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("failed")) }
    finally { setLoading(false) }
  }

  return <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4"><div className="absolute right-4 top-4"><LanguageToggle /></div><Card className="w-full max-w-lg shadow-xl"><CardHeader className="text-center"><span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><Store className="size-7" /></span><CardTitle className="mt-4 text-2xl">{t("title")}</CardTitle><CardDescription>{t("description")}</CardDescription></CardHeader><CardContent><form onSubmit={submit} className="space-y-5">{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}<div className="space-y-2"><Label htmlFor="businessName">{t("businessName")}</Label><Input id="businessName" value={form.businessName} onChange={update("businessName")} placeholder={t("businessPlaceholder")} className="h-12" required minLength={2} /></div><div className="space-y-2"><Label htmlFor="slug">{t("slug")}</Label><div className="relative"><Input id="slug" value={form.slug} onChange={update("slug")} placeholder={t("slugPlaceholder")} className="h-12 pr-28" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">.kasir-ku.id</span></div></div><div className="space-y-2"><Label htmlFor="branchName">{t("branchName")}</Label><div className="relative"><Building2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="branchName" value={form.branchName} onChange={update("branchName")} className="h-12 pl-10" required /></div></div><Button className="h-12 w-full bg-emerald-600 hover:bg-emerald-700" disabled={loading}>{loading && <Loader2 className="animate-spin" />} {loading ? t("submitting") : t("submit")}</Button></form></CardContent></Card></main>
}