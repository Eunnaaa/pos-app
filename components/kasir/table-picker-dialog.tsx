"use client"

import { useState } from "react"
import { Check, Users, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

type Table = { id: string; name: string; capacity: number; status: string }

interface TablePickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (tableId: string) => void
  tables: Table[]
  partySize: number
}

export function TablePickerDialog({ open, onOpenChange, onSelect, tables, partySize }: TablePickerDialogProps) {
  const [search, setSearch] = useState("")

  const filteredTables = tables
    .filter(tbl => tbl.capacity >= partySize)
    .filter(tbl => tbl.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (a.status === "available" && b.status !== "available") return -1
      if (b.status === "available" && a.status !== "available") return 1
      return a.capacity - b.capacity
    })

  if (!open) return null

  const renderTableButton = (table: Table) => (
    <Button
      key={table.id}
      variant={table.status === "available" ? "default" : "outline"}
      className="w-full justify-start gap-3"
      onClick={() => onSelect(table.id)}
      disabled={table.status !== "available"}
    >
      <div className="flex-1 text-left">
        <div className="flex items-center gap-2">
          <span className="font-medium">{table.name}</span>
          <Badge variant={table.status === "available" ? "default" : "secondary"} className="text-xs">
            {table.status === "available" ? "Tersedia" : table.status === "occupied" ? "Terisi" : table.status === "reserved" ? "Dipesan" : "Tidak Aktif"}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Kapasitas: {table.capacity} Tamu
        </p>
      </div>
      {table.status === "available" && <Check className="size-5 text-emerald-600" />}
      {table.status !== "available" && <XCircle className="size-5 text-muted-foreground" />}
    </Button>
  )

  if (!open) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="size-5 text-emerald-600" />
            Pilih Meja
          </DialogTitle>
          <DialogDescription>Pilih meja untuk {partySize} tamu</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="relative">
            <Input
              placeholder="Cari meja..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10"
            />
            <Users className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          </div>
          <div className="max-h-96 overflow-y-auto space-y-2">
            {filteredTables.length === 0 ? (
              <p className="text-center text-muted-foreground">Tidak ada meja yang cocok</p>
            ) : (
              filteredTables.map(table => renderTableButton(table))
            )}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}