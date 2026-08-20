"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Cookie } from "lucide-react"
import { Button } from "@/components/ui/button"
import { showInfo } from "@/lib/toast-handler"

const CONSENT_KEY = "kasir-ku-cookie-consent"

export function CookieConsent() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CONSENT_KEY)
      if (!stored) setVisible(true)
    } catch {
      setVisible(true)
    }
  }, [])

  function dismiss(value: "accepted" | "rejected") {
    try {
      localStorage.setItem(CONSENT_KEY, value)
    } catch {
      // localStorage might be unavailable (private mode); dismiss visually only
    }
    setVisible(false)
    showInfo(value === "accepted" ? "Preferensi cookie disimpan" : "Preferensi cookie disimpan")
  }

  if (!visible) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-4 sm:p-6">
      <div className="mx-auto flex max-w-3xl flex-col items-start gap-4 rounded-xl border bg-card p-5 shadow-lg sm:flex-row sm:items-center">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><Cookie className="size-5" /></span>
        <div className="flex-1 text-sm text-muted-foreground">
          Kami menggunakan cookie esensial untuk menjaga sesi login dan preferensi aplikasi. Kami tidak menggunakan cookie pelacakan iklan. Lihat <Link href="/privacy" className="font-semibold text-emerald-600 hover:underline">Kebijakan Privasi</Link>.
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => dismiss("rejected")}>Tolak</Button>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => dismiss("accepted")}>Setuju</Button>
        </div>
      </div>
    </div>
  )
}
