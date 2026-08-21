"use client"

import { useEffect, useState } from "react"
import { Smartphone, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { showError, showSuccess } from "@/lib/toast-handler"
import { syncOfflineMutations } from "@/lib/offline/queue"

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

export function PwaRegister() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const handlePrompt = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener("beforeinstallprompt", handlePrompt)
    return () => window.removeEventListener("beforeinstallprompt", handlePrompt)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return

    if (process.env.NODE_ENV !== "production") {
      // In development, auto-unregister service workers to prevent stale cache & hydration mismatch
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          void registration.unregister()
        }
      }).catch(() => undefined)
      if ("caches" in window) {
        caches.keys().then((keys) => {
          keys.forEach((key) => void caches.delete(key))
        }).catch(() => undefined)
      }
      return
    }

    const sync = async () => {
      const { failed } = await syncOfflineMutations()
      if (failed > 0) showError(`${failed} transaksi offline ditolak server — perlu diperiksa dan diinput ulang manual`, { duration: 15_000 })
    }

    navigator.serviceWorker.register("/sw.js").then((registration) => {
      if (navigator.onLine) void sync()
      return registration.update()
    }).catch(() => undefined)

    const handleOnline = () => void sync()
    const handleMessage = (event: MessageEvent<{ type?: string }>) => {
      if (event.data?.type === "SYNC_PENDING_TRANSACTIONS") void sync()
    }
    window.addEventListener("online", handleOnline)
    navigator.serviceWorker.addEventListener("message", handleMessage)
    return () => {
      window.removeEventListener("online", handleOnline)
      navigator.serviceWorker.removeEventListener("message", handleMessage)
    }
  }, [])

  if (!installPrompt || dismissed) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 sm:left-auto sm:right-6 sm:max-w-xs bg-slate-950 text-white rounded-2xl p-3.5 shadow-2xl border border-slate-800 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-slate-950 font-bold">
          <Smartphone className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold truncate">Install POS App</p>
          <p className="text-[10px] text-slate-400 truncate">Akses cepat di Home Screen</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Button
          size="sm"
          className="h-7 text-[11px] font-bold bg-emerald-500 hover:bg-emerald-600 text-slate-950 rounded-xl px-2.5"
          onClick={async () => {
            if (!installPrompt) return
            await installPrompt.prompt()
            const choice = await installPrompt.userChoice
            if (choice.outcome === "accepted") {
              showSuccess("Aplikasi berhasil disimpan ke HP!")
            }
            setInstallPrompt(null)
          }}
        >
          Install
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-white rounded-lg p-0" onClick={() => setDismissed(true)}>
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}
