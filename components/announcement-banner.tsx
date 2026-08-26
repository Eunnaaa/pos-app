"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, Info, Megaphone, Sparkles, X } from "lucide-react"
import { apiFetch } from "@/lib/client"

interface ActiveAnnouncement {
  id: string
  title: string
  message: string
  type: "info" | "warning" | "success" | "promo"
}

export function AnnouncementBanner() {
  const [announcements, setAnnouncements] = useState<ActiveAnnouncement[]>([])
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({})

  useEffect(() => {
    async function fetchAnnouncements() {
      try {
        const res = await apiFetch<{ announcements: ActiveAnnouncement[] }>("/api/v1/announcements/active")
        if (res?.data?.announcements) {
          setAnnouncements(res.data.announcements)
        }
      } catch {
        // Silently fail if unconfigured
      }
    }
    void fetchAnnouncements()
  }, [])

  const visible = announcements.filter((a) => !dismissed[a.id])
  if (visible.length === 0) return null

  return (
    <div className="space-y-2 mb-4">
      {visible.map((item) => {
        const bg =
          item.type === "warning"
            ? "bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200"
            : item.type === "promo"
              ? "bg-purple-500/10 border-purple-500/30 text-purple-900 dark:text-purple-200"
              : item.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-200"
                : "bg-blue-500/10 border-blue-500/30 text-blue-900 dark:text-blue-200"

        const Icon =
          item.type === "warning"
            ? AlertTriangle
            : item.type === "promo"
              ? Sparkles
              : item.type === "success"
                ? Megaphone
                : Info

        return (
          <div
            key={item.id}
            className={`p-3 rounded-xl border flex items-start justify-between gap-3 text-xs shadow-xs ${bg}`}
          >
            <div className="flex items-start gap-2.5">
              <Icon className="size-4 shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold">{item.title}</strong>: {item.message}
              </div>
            </div>
            <button
              type="button"
              className="opacity-70 hover:opacity-100 p-0.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5"
              onClick={() => setDismissed((prev) => ({ ...prev, [item.id]: true }))}
            >
              <X className="size-3.5" />
              <span className="sr-only">Tutup</span>
            </button>
          </div>
        )
      })}
    </div>
  )
}
