"use client"

import { useCallback, useEffect, useState } from "react"
import { ChefHat, Clock, Loader2, RefreshCw, AlertTriangle, Bell, Volume2, VolumeX, Utensils, User } from "lucide-react"
import { useOrganization } from "@/components/kasir/organization-provider"
import { apiFetch } from "@/lib/client"
import { subscribeToTable } from "@/lib/client/realtime"
import { showError, showSuccess } from "@/lib/toast-handler"
import { playKitchenBellSound } from "@/lib/services/sound-alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"

type TicketItem = {
  id: string
  item_name: string
  quantity: string
  unit_price?: string
  status: string
  notes: string | null
}

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
  channel?: "pos" | "self_order" | "kiosk"
  order_notes?: string | null
  order_status?: string
  total_amount: string
  customer_name: string | null
  table_name?: string | null
  table_area?: string | null
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
  if (minutes < 60) return `${minutes}m lalu`
  return `${Math.floor(minutes / 60)}j ${minutes % 60}m lalu`
}

function getStatusColor(ticket: Ticket, col: ColumnConfig): string {
  const elapsedMs = Date.now() - new Date(ticket.started_at || ticket.created_at).getTime()
  if (elapsedMs >= col.dangerAfter) return "text-rose-600 font-bold"
  if (elapsedMs >= col.warnAfter) return "text-amber-600 font-bold"
  return "text-muted-foreground"
}

function getStatusBadge(ticket: Ticket, col: ColumnConfig): React.ReactNode {
  const elapsedMs = Date.now() - new Date(ticket.started_at || ticket.created_at).getTime()
  if (elapsedMs >= col.dangerAfter) {
    return <Badge variant="destructive" className="gap-1 text-[10px] px-1.5 py-0"><AlertTriangle className="size-2.5" />LAMA</Badge>
  }
  if (elapsedMs >= col.warnAfter) {
    return <Badge variant="secondary" className="gap-1 text-[10px] px-1.5 py-0 text-amber-700 bg-amber-100 dark:bg-amber-950 dark:text-amber-300"><AlertTriangle className="size-2.5" />PERINGATAN</Badge>
  }
  return null
}

export function KitchenDisplayPage() {
  const { organization, branch } = useOrganization()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string>()
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [prevCount, setPrevCount] = useState(0)
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)

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

  const orgId = organization?.id
  useEffect(() => {
    void load()
    const unsub = orgId ? subscribeToTable("kitchen_tickets", orgId, () => void load()) : undefined
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
      unsub?.()
      clearInterval(interval)
      window.removeEventListener("kedai-ku-context-change", handleContextChange)
      document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [load, orgId])

  async function advance(ticket: Ticket, next: "cooking" | "ready" | "served") {
    setUpdating(ticket.id)
    try {
      await apiFetch(`/api/v1/kitchen/tickets/${ticket.id}`, { method: "PATCH", body: JSON.stringify({ status: next }) })
      
      // Bunyikan bel dapur otomatis ketika pesanan selesai dimasak dan masuk ke form/kolom Siap Saji
      if (next === "ready" || soundEnabled) {
        playKitchenBellSound()
      }

      showSuccess(`Tiket ${ticket.number} → ${next === "cooking" ? "dimasak" : next === "ready" ? "siap saji 🔔" : "disajikan"}`)
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
            <p className="text-sm text-muted-foreground">Antrean pesanan dapur — klik kartu untuk melihat detail pesanan.</p>
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
                <div className="flex items-center justify-between rounded-xl border bg-card p-3 shadow-xs">
                  <div className="flex items-center gap-2">
                    <span className={`size-2.5 rounded-full ${col.color}`} />
                    <span className="font-bold text-sm">{col.title}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-bold">{colTickets.length}</Badge>
                    <Badge variant="secondary" className="text-xs">
                      <AlertTriangle className="size-2.5 mr-1" />
                      {col.warnAfter / 60_000}m / {col.dangerAfter / 60_000}m
                    </Badge>
                  </div>
                </div>
                <ScrollArea className="flex-1">
                  <div className="flex flex-col gap-3 pr-3">
                    {colTickets.length === 0 && (
                      <div className="flex h-32 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground bg-muted/20">
                        Tidak ada pesanan
                      </div>
                    )}
                    {colTickets.map((ticket) => (
                      <Card
                        key={ticket.id}
                        onClick={() => setSelectedTicket(ticket)}
                        className="break-inside-avoid cursor-pointer transition-all duration-200 hover:border-emerald-500/60 hover:shadow-md active:scale-[0.99] border-border/80 group select-none"
                      >
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between gap-2">
                            <CardTitle className="text-sm font-bold truncate group-hover:text-emerald-600 transition-colors">
                              {ticket.order_number}
                            </CardTitle>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Badge variant="outline" className={`gap-1 text-xs font-semibold ${getStatusColor(ticket, col)}`}>
                                <Clock className="size-3" />
                                {elapsed(ticket.started_at || ticket.created_at)}
                              </Badge>
                              {getStatusBadge(ticket, col)}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-xs text-muted-foreground">
                            {ticket.table_name && (
                              <span className="font-semibold text-foreground bg-muted/80 px-1.5 py-0.5 rounded text-[11px]">
                                🪑 {ticket.table_name}
                              </span>
                            )}
                            {ticket.customer_name && (
                              <span className="truncate max-w-[140px] font-medium">👤 {ticket.customer_name}</span>
                            )}
                            {ticket.channel === "self_order" && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 font-semibold">
                                QR Meja
                              </Badge>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-2 pt-0">
                          <div className="space-y-1">
                            {ticket.items.map((item) => (
                              <div key={item.id} className="flex items-start justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-sm">
                                <span className="font-bold text-emerald-700 dark:text-emerald-400 shrink-0">{item.quantity}x</span>
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold leading-tight truncate">{item.item_name}</p>
                                  {item.notes && <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mt-0.5">⚠ {item.notes}</p>}
                                </div>
                              </div>
                            ))}
                          </div>

                          {ticket.order_notes && (
                            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 p-2 text-xs text-amber-800 dark:text-amber-300 border border-amber-200/60 dark:border-amber-900/40">
                              📝 <span className="font-medium">{ticket.order_notes}</span>
                            </div>
                          )}

                          <div className="flex items-center gap-2 pt-1">
                            <Button
                              size="sm"
                              className={`flex-1 font-bold shadow-xs ${col.next === "cooking" ? "bg-blue-600 hover:bg-blue-700 text-white" : col.next === "ready" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-violet-600 hover:bg-violet-700 text-white"}`}
                              disabled={updating === ticket.id}
                              onClick={(e) => {
                                e.stopPropagation()
                                void advance(ticket, col.next)
                              }}
                            >
                              {updating === ticket.id ? <Loader2 className="size-4 animate-spin" /> : col.action}
                            </Button>
                          </div>
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

      {/* Modal Detail Pesanan Dapur */}
      <Dialog open={Boolean(selectedTicket)} onOpenChange={(open) => !open && setSelectedTicket(null)}>
        <DialogContent className="max-w-md p-6">
          {selectedTicket && (
            <>
              <DialogHeader className="pb-3 border-b">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-xs font-mono font-bold px-2 py-0.5">
                    {selectedTicket.number}
                  </Badge>
                  <Badge
                    className={
                      selectedTicket.status === "queued"
                        ? "bg-amber-500 text-white"
                        : selectedTicket.status === "cooking"
                          ? "bg-blue-500 text-white"
                          : "bg-emerald-500 text-white"
                    }
                  >
                    {selectedTicket.status === "queued" ? "Antrean" : selectedTicket.status === "cooking" ? "Sedang Dimasak" : "Siap Disajikan"}
                  </Badge>
                </div>
                <DialogTitle className="text-xl font-bold mt-2">
                  {selectedTicket.order_number}
                </DialogTitle>
                <DialogDescription className="text-xs flex flex-wrap items-center gap-2 mt-1">
                  <span>Dipesan {elapsed(selectedTicket.created_at)}</span>
                  <span>•</span>
                  <span>
                    {new Date(selectedTicket.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })} WIB
                  </span>
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2 text-sm">
                {/* Info Meja & Pelanggan */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-3 rounded-xl border bg-muted/40 space-y-1">
                    <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
                      <Utensils className="size-3.5 text-emerald-600" /> Meja / Tipe
                    </span>
                    <p className="font-bold text-sm text-foreground">
                      {selectedTicket.table_name ? `Meja ${selectedTicket.table_name}` : "Takeaway / Dine In"}
                    </p>
                    {selectedTicket.table_area && (
                      <p className="text-[11px] text-muted-foreground font-medium">{selectedTicket.table_area}</p>
                    )}
                  </div>

                  <div className="p-3 rounded-xl border bg-muted/40 space-y-1">
                    <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
                      <User className="size-3.5 text-blue-600" /> Pelanggan
                    </span>
                    <p className="font-bold text-sm text-foreground truncate">
                      {selectedTicket.customer_name || "Pelanggan Umum"}
                    </p>
                    <p className="text-[11px] text-muted-foreground font-medium capitalize">
                      Channel: {selectedTicket.channel === "self_order" ? "Self-Order QR" : selectedTicket.channel || "POS Kasir"}
                    </p>
                  </div>
                </div>

                {/* Catatan Khusus Pesanan */}
                {selectedTicket.order_notes && (
                  <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 space-y-1">
                    <span className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                      <AlertTriangle className="size-3.5 text-amber-600" /> Catatan Pesanan dari Pelanggan:
                    </span>
                    <p className="text-xs text-amber-800 dark:text-amber-300 font-medium">
                      {selectedTicket.order_notes}
                    </p>
                  </div>
                )}

                {/* Daftar Item Masakan */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    <span>Daftar Menu ({selectedTicket.items.length} item)</span>
                    <span>Kuantitas</span>
                  </div>

                  <div className="divide-y rounded-xl border bg-card overflow-hidden">
                    {selectedTicket.items.map((item, idx) => (
                      <div key={item.id || idx} className="p-3 flex items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0 flex-1">
                          <p className="font-bold text-sm text-foreground">{item.item_name}</p>
                          {item.notes && (
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-xs font-medium">
                              <span>⚠</span>
                              <span>{item.notes}</span>
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <span className="inline-flex items-center justify-center size-8 rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-black text-sm">
                            {item.quantity}x
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Total Ringkasan */}
                {selectedTicket.total_amount && (
                  <div className="flex items-center justify-between border-t pt-3 text-xs">
                    <span className="text-muted-foreground font-medium">Total Nilai Pesanan:</span>
                    <span className="font-extrabold text-sm text-emerald-600 dark:text-emerald-400">
                      Rp {Number(selectedTicket.total_amount).toLocaleString("id-ID")}
                    </span>
                  </div>
                )}
              </div>

              <DialogFooter className="flex flex-col sm:flex-row gap-2 border-t pt-3">
                <Button
                  variant="outline"
                  className="w-full sm:w-auto text-xs"
                  onClick={() => setSelectedTicket(null)}
                >
                  Tutup
                </Button>

                {selectedTicket.status === "queued" && (
                  <Button
                    className="w-full sm:flex-1 text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold"
                    disabled={updating === selectedTicket.id}
                    onClick={async () => {
                      const current = selectedTicket
                      setSelectedTicket(null)
                      await advance(current, "cooking")
                    }}
                  >
                    Mulai Masak 🍳
                  </Button>
                )}

                {selectedTicket.status === "cooking" && (
                  <Button
                    className="w-full sm:flex-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                    disabled={updating === selectedTicket.id}
                    onClick={async () => {
                      const current = selectedTicket
                      setSelectedTicket(null)
                      await advance(current, "ready")
                    }}
                  >
                    Selesai Masak & Siap Saji 🔔
                  </Button>
                )}

                {selectedTicket.status === "ready" && (
                  <Button
                    className="w-full sm:flex-1 text-xs bg-violet-600 hover:bg-violet-700 text-white font-bold"
                    disabled={updating === selectedTicket.id}
                    onClick={async () => {
                      const current = selectedTicket
                      setSelectedTicket(null)
                      await advance(current, "served")
                    }}
                  >
                    Sajikan ke Meja 🍽️
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

