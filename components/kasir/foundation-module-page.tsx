"use client"

import { useMemo, useState } from "react"
import { Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react"
import { showError, showSuccess } from "@/lib/toast-handler"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useResource } from "@/hooks/use-resource"

type Field = { key: string; label: string; type?: "text" | "number" | "datetime-local"; required?: boolean }
type ModuleConfig = { title: string; description: string; resource: string; fields: Field[]; columns: Field[] }
type RecordValue = { id: string; [key: string]: unknown }

const configs: Record<string, ModuleConfig> = {
  promotions: { title: "Promosi", description: "Kelola diskon dan promo terjadwal.", resource: "promotions", fields: [{ key: "name", label: "Nama promo", required: true }, { key: "code", label: "Kode" }, { key: "type", label: "Tipe", required: true }, { key: "valueAmount", label: "Nilai", type: "number" }, { key: "usageLimit", label: "Batas penggunaan", type: "number" }], columns: [{ key: "name", label: "Nama" }, { key: "code", label: "Kode" }, { key: "type", label: "Tipe" }, { key: "value_amount", label: "Nilai" }] },
  employees: { title: "Karyawan", description: "Kelola karyawan dan status kerja.", resource: "employees", fields: [{ key: "employeeNumber", label: "Nomor", required: true }, { key: "name", label: "Nama", required: true }, { key: "email", label: "Email" }, { key: "jobTitle", label: "Jabatan" }, { key: "employmentStatus", label: "Status" }], columns: [{ key: "employee_number", label: "Nomor" }, { key: "name", label: "Nama" }, { key: "job_title", label: "Jabatan" }, { key: "employment_status", label: "Status" }] },
  reservations: { title: "Reservasi", description: "Kelola booking dan waiting list.", resource: "reservations", fields: [{ key: "bookingNumber", label: "Nomor booking", required: true }, { key: "guestName", label: "Nama tamu", required: true }, { key: "guestPhone", label: "Telepon" }, { key: "partySize", label: "Jumlah tamu", type: "number" }, { key: "reservedAt", label: "Waktu", type: "datetime-local" }, { key: "status", label: "Status" }], columns: [{ key: "booking_number", label: "Booking" }, { key: "guest_name", label: "Tamu" }, { key: "guest_phone", label: "Telepon" }, { key: "party_size", label: "Tamu" }, { key: "status", label: "Status" }] },
}

export function FoundationModulePage({ module }: { module: string }) {
  const config = configs[module] || configs.promotions
  const resource = useResource<RecordValue>(config.resource, "limit=100")
  const [search, setSearch] = useState("")
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<RecordValue | undefined>()
  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const rows = useMemo(() => resource.data.filter((row) => JSON.stringify(row).toLowerCase().includes(search.toLowerCase())), [resource.data, search])
  const showCreate = () => { setEditing(undefined); setForm({}); setOpen(true) }
  const showEdit = (row: RecordValue) => { setEditing(row); setForm(Object.fromEntries(config.fields.map((field) => [field.key, String(row[field.key] ?? row[field.key.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`)] ?? "")]))); setOpen(true) }
  async function save(event: React.FormEvent) { event.preventDefault(); setSaving(true); try { const input = Object.fromEntries(config.fields.filter((field) => form[field.key] !== "").map((field) => [field.key, field.type === "number" ? Number(form[field.key]) : field.type === "datetime-local" ? new Date(form[field.key]).toISOString() : form[field.key]])); if (editing) await resource.update(editing.id, input); else await resource.create(input); showSuccess("Data tersimpan"); setOpen(false) } catch (error) { showError(error instanceof Error ? error.message : "Gagal menyimpan") } finally { setSaving(false) } }
  async function remove(row: RecordValue) { if (!confirm("Hapus data ini?")) return; try { await resource.remove(row.id); showSuccess("Data dihapus") } catch (error) { showError(error instanceof Error ? error.message : "Gagal menghapus") } }
  return <div className="flex flex-1 flex-col gap-5 p-4 md:p-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-2xl font-bold">{config.title}</h2><p className="text-sm text-muted-foreground">{config.description}</p></div><Button onClick={showCreate} className="bg-emerald-600 hover:bg-emerald-700"><Plus /> Tambah</Button></div><Card><CardHeader className="border-b"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle>Data aktual</CardTitle><CardDescription>{rows.length} data ditemukan</CardDescription></div><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9 sm:w-72" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari data" /></div></div></CardHeader><CardContent className="p-0"><Table><TableHeader><TableRow>{config.columns.map((column) => <TableHead key={column.key}>{column.label}</TableHead>)}<TableHead /></TableRow></TableHeader><TableBody>{resource.loading && <TableRow><TableCell colSpan={config.columns.length + 1} className="h-24 text-center"><Loader2 className="mx-auto animate-spin" /></TableCell></TableRow>}{!resource.loading && rows.map((row) => <TableRow key={row.id}>{config.columns.map((column) => <TableCell key={column.key}>{String(row[column.key] ?? "—")}</TableCell>)}<TableCell><div className="flex justify-end"><Button variant="ghost" size="icon" onClick={() => showEdit(row)}><Pencil className="size-4" /></Button><Button variant="ghost" size="icon" className="text-destructive" onClick={() => void remove(row)}><Trash2 className="size-4" /></Button></div></TableCell></TableRow>)}</TableBody></Table></CardContent></Card><Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>{editing ? "Edit" : "Tambah"} {config.title}</DialogTitle></DialogHeader><form onSubmit={save} className="space-y-4">{config.fields.map((field) => <div className="space-y-2" key={field.key}><Label htmlFor={field.key}>{field.label}</Label><Input id={field.key} type={field.type || "text"} required={field.required} value={form[field.key] || ""} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))} /></div>)}<DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button><Button type="submit" disabled={saving}>{saving && <Loader2 className="animate-spin" />} Simpan</Button></DialogFooter></form></DialogContent></Dialog></div>
}
