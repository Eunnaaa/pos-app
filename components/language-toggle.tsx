"use client"

import { usePathname, useRouter } from "@/i18n/navigation"
import { useLocale } from "next-intl"
import { Globe, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useCallback, useState } from "react"
import { apiFetch } from "@/lib/client"
import { showError, showSuccess } from "@/lib/toast-handler"

const labels: Record<string, string> = { id: "Bahasa Indonesia", en: "English" }

export function LanguageToggle() {
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const [saving, setSaving] = useState(false)

  const switchLocale = useCallback(async (newLocale: string) => {
    if (newLocale === locale) return
    setSaving(true)
    try {
      router.replace(pathname, { locale: newLocale })
      showSuccess(newLocale === "en" ? "Language switched to English" : "Bahasa diganti ke Indonesia")
      await apiFetch("/api/v1/settings/me", { method: "PATCH", body: JSON.stringify({ locale: newLocale === "en" ? "en-US" : "id-ID" }) }).catch(() => {})
    } catch {
      showError("Gagal mengganti bahasa")
    } finally {
      setSaving(false)
    }
  }, [locale, pathname, router])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="size-8" disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Globe className="size-4" />}
          <span className="sr-only">Language</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {(["id", "en"] as const).map((lng) => (
          <DropdownMenuItem key={lng} onClick={() => void switchLocale(lng)} className={lng === locale ? "bg-muted font-medium" : ""}>
            {labels[lng]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
