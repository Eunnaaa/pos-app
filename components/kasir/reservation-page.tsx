"use client"

import { useCallback, useEffect, useState } from "react"
import { Plus, Search, Calendar, Loader2, Edit } from "lucide-react"
import { showError, showSuccess } from "@/lib/toast-handler"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useOrganization } from "@/components/kasir/organization-provider"
import { useResource } from "@/hooks/use-resource"
import { apiFetch } from "@/lib/client"
import { subscribeToTable } from "@/lib/client/realtime"
import { useTranslations } from "next-intl"
import { format, parseISO } from "date-fns"
import { ReservationCard } from "./reservation-card"
import { ReservationDialog } from "./reservation-dialog"
import { TablePickerDialog } from "./table-picker-dialog"

type Table = { id: string; name: string; capacity: number; status: string }
type Customer = { id: string; name: string; phone: string }
type Reservation = {
  id: string
  guestName: string
  guestPhone: string | null
  partySize: number
  status: "pending" | "confirmed" | "seated" | "completed" | "cancelled" | "no_show" | "waiting" | "meeting"
  reservedAt: string
  tableId: string | null
  customerId: string | null
  notes: string | null
  table?: { name: string; capacity: number } | null
  customer?: { name: string; phone: string } | null
}
type ReservationForm = {
  guestName: string
  guestPhone: string
  partySize: number
  status: "pending" | "confirmed" | "seated" | "completed" | "cancelled" | "no_show" | "waiting" | "meeting"
  reservedAt: string
  tableId: string
  notes: string
}

const statusOrder: Reservation["status"][] = ["waiting", "pending", "confirmed", "seated", "meeting", "completed", "no_show", "cancelled"]

export function ReservationPage() {
  const t = useTranslations("Reservation")
  const { branch } = useOrganization()
  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState<"all" | Reservation["status"]>("all")
  const [viewMode] = useState<"cards" | "list">("cards")
  const [openDialog, setOpenDialog] = useState(false)
  const [editing, setEditing] = useState<Reservation | null>(null)
  const [tablePickerOpen, setTablePickerOpen] = useState(false)
  const [selectedForSeating, setSelectedForSeating] = useState<Reservation | null>(null)

  const reservations = useResource<Reservation>("reservations", "limit=100")
  const tables = useResource<Table>("dining-tables", "limit=100")
  const customers = useResource<Customer>("customers", "limit=100")

  const refreshReservations = reservations.refresh
  const refreshTables = tables.refresh
  const refreshCustomers = customers.refresh

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshReservations(0), refreshTables(0), refreshCustomers(0)])
  }, [refreshReservations, refreshTables, refreshCustomers])

  useEffect(() => {
    void refreshAll()
  }, [refreshAll])

  useEffect(() => {
    const unsubscribe = subscribeToTable("reservations", branch?.id || "", () => void refreshReservations(500))
    return unsubscribe
  }, [refreshReservations, branch?.id])

  const filtered = reservations.data
    .filter(r => {
      if (filterStatus !== "all" && r.status !== filterStatus) return false
      const query = search.toLowerCase()
      return r.guestName?.toLowerCase().includes(query) ||
        r.guestPhone?.toLowerCase().includes(query) ||
        r.table?.name?.toLowerCase().includes(query) ||
        r.customer?.name?.toLowerCase().includes(query) ||
        r.id.toLowerCase().includes(query)
    })
    .sort((a, b) => {
      const aIdx = statusOrder.indexOf(a.status)
      const bIdx = statusOrder.indexOf(b.status)
      if (aIdx !== bIdx) return aIdx - bIdx
      return new Date(b.reservedAt).getTime() - new Date(a.reservedAt).getTime()
    })

  const activeCount = reservations.data.filter(r => ["pending", "confirmed", "seated", "waiting"].includes(r.status)).length
  const todayCount = reservations.data.filter(r => {
    const today = new Date().toISOString().split("T")[0]
    return r.reservedAt?.startsWith(today) && !["cancelled", "completed", "no_show"].includes(r.status)
  }).length

  async function handleCreate(data: ReservationForm) {
    try {
      await apiFetch("/api/v1/resources/reservations", {
        method: "POST",
        body: JSON.stringify({ ...data, branchId: branch?.id }),
      })
      showSuccess("Reservasi berhasil dibuat")
    } catch (error) {
      showError(error instanceof Error ? error.message : "Gagal membuat reservasi")
    }
  }

  async function handleUpdate(data: ReservationForm) {
    if (!editing) return
    try {
      await apiFetch(`/api/v1/resources/reservations/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      })
      showSuccess("Reservasi diperbarui")
    } catch (error) {
      showError(error instanceof Error ? error.message : "Gagal memperbarui reservasi")
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus reservasi ini?")) return
    try {
      await apiFetch(`/api/v1/resources/reservations/${id}`, { method: "DELETE" })
      showSuccess("Reservasi dihapus")
    } catch (error) {
      showError(error instanceof Error ? error.message : "Gagal menghapus reservasi")
    }
  }

  async function handleStatusChange(id: string, status: Reservation["status"], tableId?: string) {
    try {
      await apiFetch(`/api/v1/resources/reservations/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, ...(tableId && { tableId }) }),
      })
      showSuccess("Status diperbarui")
    } catch (error) {
      showError(error instanceof Error ? error.message : "Gagal memperbarui status")
    }
  }

  function handleTableSelect(tableId: string) {
    if (selectedForSeating) {
      handleStatusChange(selectedForSeating.id, "seated", tableId)
    }
    setTablePickerOpen(false)
    setSelectedForSeating(null)
  }

  const stats = [
    { label: t("today"), value: todayCount, icon: Calendar, color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-950" },
    { label: t("active"), value: activeCount, icon: Calendar, color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-950" },
    { label: t("waitlist"), value: reservations.data.filter(r => r.status === "waiting").length, icon: Calendar, color: "text-violet-600", bg: "bg-violet-100 dark:bg-violet-950" },
    { label: t("completed"), value: reservations.data.filter(r => r.status === "completed").length, icon: Calendar, color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-950" },
  ]

  if (!branch) return null

  return (
    <div className="flex flex-1 flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <Calendar className="size-5" />
          </span>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{t("title")}</h2>
            <p className="text-sm text-muted-foreground">{t("description")}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { setEditing(null); setOpenDialog(true) }}>
            <Plus className="size-4" /> {t("create")}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {stats.map((stat, i) => (
          <Card key={i}><CardContent className="p-5"><div className="flex items-center gap-3"><span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${stat.bg}`}><stat.icon className={`size-5 ${stat.color}`} /></span><div><p className="text-sm text-muted-foreground">{stat.label}</p><p className="mt-1 text-2xl font-bold">{stat.value}</p></div></div></CardContent></Card>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder={t("search")} value={search} onChange={e => setSearch(e.target.value)} className="pl-9 sm:w-72" /></div>
          <Select value={filterStatus} onValueChange={v => setFilterStatus(v as "all" | Reservation["status"])} >
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("all")}</SelectItem>
              {statusOrder.map(s => <SelectItem key={s} value={s}>{t(`status.${s}`)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {reservations.loading ? (
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="size-8 animate-spin text-emerald-600" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed"><CardContent className="flex min-h-[420px] flex-col items-center justify-center p-8 text-center"><span className="flex size-16 items-center justify-center rounded-2xl bg-muted"><Calendar className="size-8 text-muted-foreground" /></span><h3 className="mt-5 text-lg font-semibold">{t("empty")}</h3><p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{t("emptyDesc")}</p></CardContent></Card>
      ) : viewMode === "cards" ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map(r => (
            <ReservationCard
              key={r.id}
              reservation={r}
              tables={tables.data}
              onStatusChange={handleStatusChange}
              onEdit={r => { setEditing(r); setOpenDialog(true) }}
              onDelete={handleDelete}
            />
          ))}
        </div>
      ) : (
        <Card><CardHeader className="border-b"><CardTitle>Daftar Reservasi</CardTitle></CardHeader><CardContent className="p-0"><ScrollArea><table className="w-full text-sm"><thead><tr className="border-b"><th className="text-left py-3 px-4 font-semibold">{t("guest")}</th><th className="text-left py-3 px-4 font-semibold">{t("time")}</th><th className="text-left py-3 px-4 font-semibold">{t("partySize")}</th><th className="text-left py-3 px-4 font-semibold">{t("status")}</th><th className="text-left py-3 px-4 font-semibold">{t("table")}</th><th className="text-right py-3 px-4 font-semibold"></th></tr></thead><tbody>{filtered.map(r => <tr key={r.id} className="border-b hover:bg-muted/50"><td className="py-3 px-4">{r.guestName}</td><td className="py-3 px-4">{format(parseISO(r.reservedAt), "dd MMM HH:mm")}</td><td className="py-3 px-4">{r.partySize} {t("guests")}</td><td className="py-3 px-4"><Badge variant="outline" className="bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">{t(`status.${r.status}`)}</Badge></td><td className="py-3 px-4">{r.table?.name || "—"}</td><td className="py-3 px-4 text-right"><Button variant="ghost" size="icon" onClick={() => { setEditing(r); setOpenDialog(true) }}><Edit className="size-4" /></Button></td></tr>)}</tbody></table></ScrollArea></CardContent></Card>
      )}

      <ReservationDialog
        open={openDialog}
        onOpenChange={setOpenDialog}
        onSubmit={editing ? handleUpdate : handleCreate}
        editing={editing ? { id: editing.id, data: { guestName: editing.guestName, guestPhone: editing.guestPhone || "", partySize: editing.partySize, status: editing.status, reservedAt: editing.reservedAt, tableId: editing.tableId || "", notes: editing.notes || "" } } : null}
        tables={tables.data}
        customers={customers.data}
      />

      <TablePickerDialog
        open={tablePickerOpen}
        onOpenChange={setTablePickerOpen}
        onSelect={handleTableSelect}
        tables={tables.data}
        partySize={selectedForSeating?.partySize || 1}
      />
    </div>
  )
}