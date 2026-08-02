"use client"

import { useEffect } from "react"
import { toast } from "sonner"
import { syncOfflineMutations } from "@/lib/offline/queue"

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return
    
    const sync = async () => {
      const { failed } = await syncOfflineMutations()
      if (failed > 0) toast.error(`${failed} transaksi offline ditolak server`, { description: "Perlu diperiksa dan diinput ulang manual.", duration: 15_000 })
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

  return null
}
