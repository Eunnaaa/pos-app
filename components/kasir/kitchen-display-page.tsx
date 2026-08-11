"use client"

import { useCallback, useEffect, useState } from "react"
import { ChefHat, Clock, Loader2, RefreshCw } from "lucide-react"
import { useOrganization } from "@/components/kasir/organization-provider"
import { apiFetch } from "@/lib/client"
import { showError, showSuccess } from "@/lib/toast-handler"
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
  { key: "queued", title: "Antrean", color: "bg-amber-500", action: "Mulai Masak", next: "cooking" as const },
  { key: "cooking", title: "Dimasak", color: "bg-blue-500", action: "Siap", next: "ready" as const },
  { key: "ready", title: "Siap Saji", color: "bg-emerald-500", action: "Sajikan", next: "served" as const },
]

const elapsed = (from: string) => {
  const minutes = Math.floor((Date.now() - new Date(from).getTime()) / 60_000)
  if (minutes < 1) return "Baru saja"
  if (minutes < 60) return `${minutes} menit`
  return `${Math.floor(minutes / 60)}j ${minutes % 60}m`
}

export function KitchenDisplayPage() {
  const { branch } = useOrganization()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string>()

  const load = useCallback(async () => {
    try {
      const response = await apiFetch<Ticket[]>("/api/v1/kitchen/tickets")
      setTickets(response.data)
    } catch (error) {
      showError(error instanceof Error ? error.message : "Gagal memuat tiket dapur")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const interval = setInterval(() => void load(), 15_000)
    const handleContextChange = () => void load()
    window.addEventListener("kasir-ku-context-change", handleContextChange)
    return () => {
      clearInterval(interval)
      window.removeEventListener("kasir-ku-context-change", handleContextChange)
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
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="gap-1.5 py-1.5 pl-3 pr-3.5 text-sm">
            <ChefHat className="size-3.5 text-muted-foreground" />
            {branch?.name || "Semua Cabang"}
          </Badge>
          <Button variant="outline" size="icon" onClick={() => void load()} disabled={loading}>
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
                  <Badge variant="outline">{colTickets.length}</Badge>
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
                            <Badge variant="outline" className="gap-1 text-xs">
                              <Clock className="size-3" />
                              {elapsed(ticket.started_at || ticket.created_at)}
                            </Badge>
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
