"use client"

import { useTranslations } from "next-intl"
import { Calendar, Users, Clock, MapPin, X, Check, AlertTriangle, Plus, Edit, Trash2, MoreHorizontal } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { format, parseISO as parseISODate } from "date-fns"
import { id as idLocale, enUS as enLocale } from "date-fns/locale"

type ReservationStatus = "pending" | "confirmed" | "seated" | "completed" | "cancelled" | "no_show" | "waiting" | "meeting"

type Reservation = {
  id: string
  guestName: string
  guestPhone: string | null
  partySize: number
  status: ReservationStatus
  reservedAt: string
  tableId: string | null
  customerId: string | null
  notes: string | null
  table?: { name: string; capacity: number } | null
  customer?: { name: string; phone: string } | null
}

const statusConfig: Record<ReservationStatus, { label: string; color: string; bg: string; icon: typeof AlertTriangle | typeof Check | typeof Clock | typeof X | typeof Plus | typeof Users }> = {
  pending: { label: "Menunggu", color: "text-amber-600", bg: "bg-amber-100 dark:bg-amber-950", icon: Clock },
  confirmed: { label: "Dikonfirmasi", color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-950", icon: Check },
  seated: { label: "Sudah Duduk", color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-950", icon: Users },
  meeting: { label: "Rapat", color: "text-purple-600", bg: "bg-purple-100 dark:bg-purple-950", icon: Users },
  completed: { label: "Selesai", color: "text-slate-600", bg: "bg-slate-100 dark:bg-slate-950", icon: Check },
  cancelled: { label: "Dibatalkan", color: "text-rose-600", bg: "bg-rose-100 dark:bg-rose-950", icon: X },
  no_show: { label: "Tidak Hadir", color: "text-orange-600", bg: "bg-orange-100 dark:bg-orange-950", icon: AlertTriangle },
  waiting: { label: "Waitlist", color: "text-violet-600", bg: "bg-violet-100 dark:bg-violet-950", icon: Plus },
}

const statusFlow: Record<ReservationStatus, ReservationStatus[]> = {
  pending: ["confirmed", "cancelled", "waiting"],
  confirmed: ["seated", "cancelled", "meeting"],
  meeting: ["completed", "cancelled"],
  seated: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  no_show: [],
  waiting: ["confirmed", "cancelled"],
}

export interface ReservationCardProps {
  reservation: Reservation
  tables: { id: string; name: string; capacity: number; status: string }[]
  onStatusChange: (id: string, status: ReservationStatus, tableId?: string) => Promise<void>
  onEdit: (reservation: Reservation) => void
  onDelete: (id: string) => Promise<void>
}

export function ReservationCard({ reservation, tables, onStatusChange, onEdit, onDelete }: ReservationCardProps) {
  const t = useTranslations("Reservation")
  const config = statusConfig[reservation.status] ?? { bg: "bg-gray-100 dark:bg-gray-950", color: "text-gray-600 dark:text-gray-400", icon: MoreHorizontal }
  const nextStatuses = statusFlow[reservation.status] || []
  const locale = t("locale") === "en" ? enLocale : idLocale
  const reservedDate = reservation.reservedAt ? parseISODate(reservation.reservedAt) : new Date()
  const formattedTime = format(reservedDate, "HH:mm", { locale })
  const formattedDate = format(reservedDate, "dd MMM yyyy", { locale })
  const tableName = reservation.table?.name || (reservation.tableId ? tables.find(t => t.id === reservation.tableId)?.name : null)
  const customerName = reservation.customer?.name || reservation.guestName
  const customerPhone = reservation.customer?.phone || reservation.guestPhone

  const handleStatusClick = async (newStatus: ReservationStatus, tableId?: string) => {
    await onStatusChange(reservation.id, newStatus, tableId)
  }

  const availableTables = tables.filter(t => t.status === "available" && t.capacity >= reservation.partySize)
  const showTablePicker = nextStatuses.includes("seated") && availableTables.length > 0

  return (
    <Card className="break-inside-avoid hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold truncate">{reservation.guestName}</span>
              <Badge variant="outline" className={`${config.bg} ${config.color}`}>
                <config.icon className="size-3" />
                {t(`status.${reservation.status}`)}
              </Badge>
            </div>
            <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1"><Calendar className="size-3" />{formattedDate}</span>
              <span className="flex items-center gap-1"><Clock className="size-3" />{formattedTime}</span>
              <span className="flex items-center gap-1"><Users className="size-3" />{reservation.partySize} {t("guests")}</span>
              {tableName && <span className="flex items-center gap-1"><MapPin className="size-3" />{tableName}</span>}
            </div>
            {reservation.notes && <p className="mt-1 text-xs text-amber-600 italic">⚠ {reservation.notes}</p>}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="size-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(reservation)}><Edit className="size-4" /> {t("edit")}</DropdownMenuItem>
              {nextStatuses.length > 0 && (
                <>
                  <DropdownMenuItem onClick={() => handleStatusClick(nextStatuses[0])}><Check className="size-4" /> {t(`action.${nextStatuses[0]}`)}</DropdownMenuItem>
                  {nextStatuses.length > 1 && nextStatuses.slice(1).map(s => (
                    <DropdownMenuItem key={s} onClick={() => handleStatusClick(s)}><Check className="size-4" /> {t(`action.${s}`)}</DropdownMenuItem>
                  ))}
                </>
              )}
              <DropdownMenuItem onClick={() => onDelete(reservation.id)} className="text-destructive"><Trash2 className="size-4" /> {t("delete")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{customerName}</span>
          {customerPhone && <span className="text-sm text-muted-foreground">{customerPhone}</span>}
        </div>
        {nextStatuses.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {showTablePicker && (
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => handleStatusClick("seated")}
              >
                <MapPin className="size-3.5" /> {t("action.seat")}
              </Button>
            )}
            {nextStatuses.map(status => status !== "seated" && (
              <Button
                key={status}
                size="sm"
                variant="outline"
                onClick={() => handleStatusClick(status)}
              >
                {t(`action.${status}`)}
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}