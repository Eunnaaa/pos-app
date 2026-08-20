"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Ban, Building2, Loader2, Plus, Store } from "lucide-react"
import { useOrganization } from "@/components/kasir/organization-provider"
import { apiFetch } from "@/lib/client"
import { showError, showSuccess } from "@/lib/toast-handler"
import { useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"

export function BusinessesTab() {
  const t = useTranslations("BusinessesTab")
  const router = useRouter()
  const { organizations, organization, selectOrganization } = useOrganization()
  const [deactivatingId, setDeactivatingId] = useState<string>()

  function switchBusiness(id: string) {
    selectOrganization(id)
    showSuccess(t("switched"))
  }

  async function deactivate(id: string, name: string) {
    if (!confirm(`${t("deactivateConfirmPrefix")}${name}${t("deactivateConfirmSuffix")}`)) return
    setDeactivatingId(id)
    try {
      await apiFetch("/api/v1/settings/organization", { method: "DELETE", organizationId: id })
      showSuccess(`${t("deactivatedPrefix")} ${name} ${t("deactivatedSuffix")}`)
      window.dispatchEvent(new Event("kasir-ku-context-change"))
      await new Promise((r) => setTimeout(r, 300))
      router.replace("/dashboard")
      router.refresh()
    } catch (error) {
      showError(error instanceof Error ? error.message : "Gagal menonaktifkan bisnis")
    } finally {
      setDeactivatingId(undefined)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Store className="size-5 text-emerald-600" /> {t("title")}</CardTitle>
            <p className="text-sm text-muted-foreground">{t("desc")}</p>
          </div>
          <Button className="bg-emerald-600 hover:bg-emerald-700 shrink-0" onClick={() => router.push("/onboarding")}>
            <Plus className="size-4" /> {t("create")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {organizations.map((org) => {
            const active = org.id === organization?.id
            return (
              <div key={org.id} className={`flex items-center justify-between gap-3 rounded-xl border p-4 ${active ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/30" : ""}`}>
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950">
                    <Building2 className="size-5 text-emerald-600 dark:text-emerald-400" />
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      <span className="truncate">{org.name}</span>
                      {active ? <Badge className="bg-emerald-600">{t("active")}</Badge> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {org.slug}.kasir-ku.id • {org.branches.length} {t("branches")}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  {!active && (
                    <Button variant="outline" size="sm" onClick={() => switchBusiness(org.id)}>{t("open")}</Button>
                  )}
                  {org.role === "owner" && org.id === organization?.id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      disabled={deactivatingId === org.id}
                      onClick={() => void deactivate(org.id, org.name)}
                    >
                      {deactivatingId === org.id ? <Loader2 className="size-3.5 animate-spin" /> : <Ban className="size-3.5" />}
                      {t("deactivate")}
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Alert className="border-muted">
        <AlertDescription className="flex flex-col gap-2 text-sm">
          <span className="flex items-center gap-2 font-medium"><Ban className="size-4 text-muted-foreground" /> {t("helpTitle")}</span>
          <span className="text-muted-foreground">{t("helpDesc")}</span>
        </AlertDescription>
      </Alert>
    </div>
  )
}