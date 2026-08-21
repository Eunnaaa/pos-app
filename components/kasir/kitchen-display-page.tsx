"use client"

import { useCallback, useEffect, useState } from "react"
import { ChefHat, Clock, Loader2, RefreshCw, AlertTriangle, Bell, Volume2, VolumeX } from "lucide-react"
import { useOrganization } from "@/components/kasir/organization-provider"
import { apiFetch } from "@/lib/client"
import { showError, showSuccess } from "@/lib/toast-handler"
import { playKitchenBellSound } from "@/lib/services/sound-alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"

type TicketItem = { id: string; item_name: string; quantity: string; status: string; notes: string | null }
type Ticket = {
  id: string
  number: string
  status: string
  priority: number
  assigned_to: string | null
  started_at: string | null
  ready_at: string | null
  served_at: string | null
  created_at: string
  order_number: string
  total_amount: string
  customer_name: string | null
  items: TicketItem[]
}

const columns = [
  { key: "queued", title: "Antrean", color: "bg-amber-500", action: "Mulai Masak", next: "cooking" as const, warnAfter: 5 * 60_000, dangerAfter: 15 * 60_000 },
  { key: "cooking", title: "Dimasak", color: "bg-blue-500", action: "Siap", next: "ready" as const, warnAfter: 10 * 60_000, dangerAfter: 20 * 60_000 },
  { key: "ready", title: "Siap Saji", color: "bg-emerald-500", action: "Sajikan", next: "served" as const, warnAfter: 5 * 60_000, dangerAfter: 15 * 60_000 },
]

type ColumnConfig = typeof columns[0]

const elapsed = (from: string) => {
  const minutes = Math.floor((Date.now() - new Date(from).getTime()) / 60_000)
  if (minutes < 1) return "Baru saja"
  if (minutes < 60) return `${minutes} menit`
  return `${Math.floor(minutes / 60)}j ${minutes % 60}m`
}

function getStatusColor(ticket: Ticket, col: ColumnConfig): string {
  const elapsedMs = Date.now() - new Date(ticket.started_at || ticket.created_at).getTime()
  if (elapsedMs >= col.dangerAfter) return "text-rose-600"
  if (elapsedMs >= col.warnAfter) return "text-amber-600"
  return "text-muted-foreground"
}

function getStatusBadge(ticket: Ticket, col: ColumnConfig): React.ReactNode {
  const elapsedMs = Date.now() - new Date(ticket.started_at || ticket.created_at).getTime()
  if (elapsedMs >= col.dangerAfter) {
    return <Badge variant="destructive" className="gap-1"><AlertTriangle className="size-2.5" />LAMA</Badge>
  }
  if (elapsedMs >= col.warnAfter) {
    return <Badge variant="secondary" className="gap-1"><AlertTriangle className="size-2.5" />PERINGATAN</Badge>
  }
  return null
}

export function KitchenDisplayPage() {
  const { branch } = useOrganization()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string>()
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [prevCount, setPrevCount] = useState(0)

  const load = useCallback(async () => {
    try {
      const response = await apiFetch<Ticket[]>("/api/v1/kitchen/tickets")
      const newTickets = response.data
      setTickets(newTickets)

      // Ring bell sound if new tickets arrived
      if (soundEnabled && newTickets.length > prevCount && prevCount > 0) {
        playKitchenBellSound()
      }
      setPrevCount(newTickets.length)
    } catch (error) {
      showError(error instanceof Error ? error.message : "Gagal memuat tiket dapur")
    } finally {
      setLoading(false)
    }
  }, [soundEnabled, prevCount])

  useEffect(() => {
    void load()
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && !document.hidden) void load()
    }, 5_000)
    const handleContextChange = () => void load()
    const handleVisibility = () => {
      if (typeof document !== "undefined" && !document.hidden) void load()
    }
    window.addEventListener("kedai-ku-context-change", handleContextChange)
    document.addEventListener("visibilitychange", handleVisibility)
    return () => {
      clearInterval(interval)
      window.removeEventListener("kedai-ku-context-change", handleContextChange)
      document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [load])

  async function advance(ticket: Ticket, next: "cooking" | "ready" | "served") {
    setUpdating(ticket.id)
    try {
      await apiFetch(`/api/v1/kitchen/tickets/${ticket.id}`, { method: "PATCH", body: JSON.stringify({ status: next }) })
      showSuccess(`Tiket ${ticket.number} → ${next === "cooking" ? "dimasak" : next === "ready" ? "siap" : "disajikan"}`)
      await load()
    } catch (error) {
      showError(error instanceof Error ? error.message : "Gagal memperbarui status")
    } finally {
      setUpdating(undefined)
    }
  }

  const byStatus = (status: string) => tickets.filter((t) => t.status === status)

  return (
    <div className="flex flex-1 flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <ChefHat className="size-5" />
          </span>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Kitchen Display</h2>
            <p className="text-sm text-muted-foreground">Antrean pesanan dapur — otomatis dibuat saat checkout.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl text-xs gap-1.5 h-9 border-amber-300 bg-amber-50/50 hover:bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
            onClick={() => {
              playKitchenBellSound()
              showSuccess("Dering Bel Restoran Berbunyi!")
            }}
          >
            <Bell className="size-3.5 text-amber-600 dark:text-amber-400" /> Tes Dering Bel
          </Button>

          <Button
            variant={soundEnabled ? "default" : "outline"}
            size="sm"
            className={soundEnabled ? "bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs gap-1.5 h-9" : "rounded-xl text-xs gap-1.5 h-9"}
            onClick={() => {
              setSoundEnabled(!soundEnabled)
              if (!soundEnabled) {
                playKitchenBellSound()
                showSuccess("Suara Bel Dapur Diaktifkan")
              }
            }}
          >
            {soundEnabled ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
            {soundEnabled ? "Suara: ON" : "Suara: OFF"}
          </Button>

          <Badge variant="secondary" className="gap-1.5 py-1.5 pl-3 pr-3.5 text-sm rounded-xl">
            <ChefHat className="size-3.5 text-muted-foreground" />
            {branch?.name || "Semua Cabang"}
          </Badge>

          <Button variant="outline" size="icon" className="rounded-xl" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
          </Button>
        </div>
      </div>

      {loading && tickets.length === 0 ? (
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="size-8 animate-spin text-emerald-600" />
        </div>
      ) : (
        <div className="grid flex-1 gap-4 md:grid-cols-3">
          {columns.map((col) => {
            const colTickets = byStatus(col.key)
            return (
              <div key={col.key} className="flex flex-col gap-3">
                <div className="flex items-center justify-between rounded-lg border bg-card p-3">
                  <div className="flex items-center gap-2">
                    <span className={`size-2.5 rounded-full ${col.color}`} />
                    <span className="font-semibold">{col.title}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{colTickets.length}</Badge>
                    <Badge variant="secondary" className="text-xs">
                      <AlertTriangle className="size-2.5" />
                      {col.warnAfter / 60_000}m / {col.dangerAfter / 60_000}m
                    </Badge>
                  </div>
                </div>
                <ScrollArea className="flex-1">
                  <div className="flex flex-col gap-3 pr-3">
                    {colTickets.length === 0 && (
                      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                        Tidak ada pesanan
                      </div>
                    )}
                    {colTickets.map((ticket) => (
                      <Card key={ticket.id} className="break-inside-avoid">
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between gap-2">
                            <CardTitle className="text-sm font-semibold">{ticket.order_number}</CardTitle>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className={`gap-1 text-xs ${getStatusColor(ticket, col)}`}>
                                <Clock className="size-3" />
                                {elapsed(ticket.started_at || ticket.created_at)}
                              </Badge>
                              {getStatusBadge(ticket, col)}
                            </div>
                          </div>
                          {ticket.customer_name && (
                            <p className="text-xs text-muted-foreground">{ticket.customer_name}</p>
                          )}
                        </CardHeader>
                        <CardContent className="space-y-2 pt-0">
                          <div className="space-y-1">
                            {ticket.items.map((item) => (
                              <div key={item.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1 text-sm">
                                <span className="font-medium">{item.quantity}x</span>
                                <span className="flex-1 truncate">{item.item_name}</span>
                                {item.notes && <span className="text-xs text-amber-600">⚠ {item.notes}</span>}
                              </div>
                            ))}
                          </div>
                          <Button
                            size="sm"
                            className={`w-full ${col.next === "cooking" ? "bg-blue-600 hover:bg-blue-700" : col.next === "ready" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-violet-600 hover:bg-violet-700"}`}
                            disabled={updating === ticket.id}
                            onClick={() => void advance(ticket, col.next)}
                          >
                            {updating === ticket.id ? <Loader2 className="size-4 animate-spin" /> : col.action}
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
