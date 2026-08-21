"use client"

import { useEffect } from "react"
import { Bell } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useResource } from "@/hooks/use-resource"

type Notification = {
  id: string
  channel?: string
  template?: string
  recipient?: string
  subject?: string
  body?: string
  status?: string
  scheduled_at?: string | null
  created_at?: string
}

const statusColor: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  sent: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
  read: "bg-muted text-muted-foreground",
}

export function NotificationBell() {
  const notifications = useResource<Notification>("notifications", "limit=20")

  useEffect(() => {
    const handler = () => void notifications.refresh()
    window.addEventListener("kedai-ku-context-change", handler)
    return () => window.removeEventListener("kedai-ku-context-change", handler)
  }, [notifications])

  const unread = notifications.data.filter((n) => n.status !== "read" && n.status !== "failed")

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="size-5" />
          {unread.length > 0 && (
            <span className="absolute right-2 top-2 flex size-2 items-center justify-center rounded-full bg-rose-500 ring-2 ring-background" />
          )}
          <span className="sr-only">Notifikasi</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b p-3">
          <span className="font-semibold text-sm">Notifikasi</span>
          {unread.length > 0 && <Badge variant="outline" className="text-xs">{unread.length} baru</Badge>}
        </div>
        <ScrollArea className="max-h-80">
          <div className="flex flex-col">
            {notifications.loading && <div className="p-6 text-center text-sm text-muted-foreground">Memuat...</div>}
            {!notifications.loading && notifications.data.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">Tidak ada notifikasi.</div>
            )}
            {notifications.data.map((n) => (
              <div key={n.id} className="flex items-start gap-2 border-b p-3 last:border-0">
                <Badge variant="outline" className={`shrink-0 text-xs ${statusColor[n.status ?? ""] ?? ""}`}>{n.status ?? "—"}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{n.subject || n.template || "Notifikasi"}</p>
                  <p className="truncate text-xs text-muted-foreground">{n.recipient || n.body || ""}</p>
                  {n.created_at && <p className="mt-0.5 text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}</p>}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
