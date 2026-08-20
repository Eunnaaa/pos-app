"use client"

import { useTranslations } from "next-intl"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useEffect, useState } from "react"
import { format } from "date-fns"

type ReservationForm = {
  guestName: string
  guestPhone: string
  partySize: number
  status: "pending" | "confirmed" | "seated" | "completed" | "cancelled" | "no_show" | "waiting" | "meeting"
  reservedAt: string
  tableId: string
  notes: string
}

type Table = { id: string; name: string; capacity: number; status: string }

interface ReservationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: ReservationForm) => Promise<void>
  editing?: { id: string; data: ReservationForm } | null
  tables: Table[]
  customers: { id: string; name: string; phone: string }[]
}

export function ReservationDialog({ open, onOpenChange, onSubmit, editing, tables }: ReservationDialogProps) {
  const t = useTranslations("Reservation")
  const [form, setForm] = useState<ReservationForm>({
    guestName: "",
    guestPhone: "",
    partySize: 1,
    status: "pending",
    reservedAt: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    tableId: "",
    notes: "",
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (editing) {
      setForm({
        guestName: editing.data.guestName,
        guestPhone: editing.data.guestPhone,
        partySize: editing.data.partySize,
        status: editing.data.status,
        reservedAt: editing.data.reservedAt.slice(0, 16),
        tableId: editing.data.tableId || "",
        notes: editing.data.notes || "",
      })
    } else {
      setForm({
        guestName: "",
        guestPhone: "",
        partySize: 1,
        status: "pending",
        reservedAt: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        tableId: "",
        notes: "",
      })
    }
  }, [editing])

  const availableTables = tables.filter(t => t.status === "available")

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    try {
      await onSubmit(form)
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <X className="size-5 text-emerald-600" />
            {editing ? t("edit") : t("create")}
          </DialogTitle>
          <DialogDescription>{editing ? t("editDesc") : t("createDesc")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="guestName">{t("guestName")}</Label>
              <Input id="guestName" value={form.guestName} onChange={e => setForm({ ...form, guestName: e.target.value })} required placeholder={t("guestNamePlaceholder")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="guestPhone">{t("guestPhone")}</Label>
              <Input id="guestPhone" type="tel" value={form.guestPhone} onChange={e => setForm({ ...form, guestPhone: e.target.value })} placeholder={t("guestPhonePlaceholder")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="partySize">{t("partySize")}</Label>
              <Input id="partySize" type="number" min="1" max="50" value={form.partySize} onChange={e => setForm({ ...form, partySize: Number(e.target.value) || 1 })} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reservedAt">{t("reservedAt")}</Label>
              <Input id="reservedAt" type="datetime-local" value={form.reservedAt} onChange={e => setForm({ ...form, reservedAt: e.target.value })} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tableId">{t("table")}</Label>
            <Select value={form.tableId} onValueChange={value => setForm({ ...form, tableId: value })} disabled={availableTables.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder={availableTables.length === 0 ? t("noTablesAvailable") : t("selectTable")} />
              </SelectTrigger>
              <SelectContent>
                {availableTables.map(table => (
                  <SelectItem key={table.id} value={table.id}>{table.name} ({t("capacity")}: {table.capacity})</SelectItem>
                ))}
                {!availableTables.length && <SelectItem value="none" disabled>{t("noTablesAvailable")}</SelectItem>}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">{t("status")}</Label>
            <Select value={form.status} onValueChange={value => setForm({ ...form, status: value as "pending" | "confirmed" | "seated" | "completed" | "cancelled" | "no_show" | "waiting" })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">{t("status.pending")}</SelectItem>
                <SelectItem value="confirmed">{t("status.confirmed")}</SelectItem>
                <SelectItem value="seated">{t("status.seated")}</SelectItem>
                <SelectItem value="meeting">{t("status.meeting")}</SelectItem>
                <SelectItem value="completed">{t("status.completed")}</SelectItem>
                <SelectItem value="cancelled">{t("status.cancelled")}</SelectItem>
                <SelectItem value="no_show">{t("status.no_show")}</SelectItem>
                <SelectItem value="waiting">{t("status.waiting")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">{t("notes")}</Label>
            <Textarea id="notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder={t("notesPlaceholder")} rows={3} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={submitting}>
              {submitting ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}