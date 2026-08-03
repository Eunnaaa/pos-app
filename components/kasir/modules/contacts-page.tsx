"use client"

import { useMemo, useState } from "react"
import { ContactRound, Loader2, Pencil, Plus, Search, Trash2, Truck } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useResource } from "@/hooks/use-resource"

type Contact = { id: string; code: string; name: string; email?: string; phone?: string; address?: string; notes?: string; contact_name?: string; payment_terms_days?: number; total_spend_amount?: string; store_credit_amount?: string; is_active: boolean; created_at?: string }
type ContactForm = { code: string; name: string; email: string; phone: string; address: string; notes: string; contactName: string; paymentTermsDays: string; active: boolean }
const empty: ContactForm = { code: "", name: "", email: "", phone: "", address: "", notes: "", contactName: "", paymentTermsDays: "0", active: true }

export function ContactsPage({ type }: { type: "customers" | "suppliers" }) {
  const supplier = type === "suppliers"
  const resource = useResource<Contact>(type, "limit=100")
  const [search, setSearch] = useState("")
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<Contact>()
  const [form, setForm] = useState<ContactForm>(empty)
  const visible = useMemo(() => resource.data.filter((item) => `${item.code} ${item.name} ${item.email || ""} ${item.phone || ""}`.toLowerCase().includes(search.toLowerCase())), [resource.data, search])

  function showCreate() { setEditing(undefined); setForm(empty); setOpen(true) }
  function showEdit(item: Contact) { setEditing(item); setForm({ code: item.code, name: item.name, email: item.email || "", phone: item.phone || "", address: item.address || "", notes: item.notes || "", contactName: item.contact_name || "", paymentTermsDays: String(item.payment_terms_days || 0), active: item.is_active }); setOpen(true) }
  const update = (field: keyof ContactForm) => (event: React.ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, [field]: event.target.value }))

  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true)
    try {
      const input = supplier
        ? { code: form.code, name: form.name, contactName: form.contactName || null, email: form.email || null, phone: form.phone || null, address: form.address || null, paymentTermsDays: Number(form.paymentTermsDays), isActive: form.active }
        : { code: form.code, name: form.name, email: form.email || null, phone: form.phone || null, address: form.address || null, notes: form.notes || null, isActive: form.active }
      if (editing) await resource.update(editing.id, input); else await resource.create(input)
      toast.success(`${supplier ? "Supplier" : "Customer"} ${editing ? "diperbarui" : "ditambahkan"}`); setOpen(false)
    } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Gagal menyimpan data") }
    finally { setSaving(false) }
  }

  async function remove(item: Contact) {
    if (!confirm(`Hapus ${item.name}?`)) return
    try { await resource.remove(item.id); toast.success("Data dihapus") } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Gagal menghapus") }
  }

  const Icon = supplier ? Truck : ContactRound
  return <div className="flex flex-1 flex-col gap-5 p-4 md:p-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-2xl font-bold">{supplier ? "Supplier" : "Customer CRM"}</h2><p className="text-sm text-muted-foreground">Data {supplier ? "pemasok" : "pelanggan"} langsung dari database.</p></div><Button className="bg-emerald-600 hover:bg-emerald-700" onClick={showCreate}><Plus /> Tambah {supplier ? "supplier" : "customer"}</Button></div><div className="grid gap-3 sm:grid-cols-3"><Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Total</p><p className="mt-2 text-2xl font-bold">{resource.data.length}</p></CardContent></Card><Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Aktif</p><p className="mt-2 text-2xl font-bold text-emerald-600">{resource.data.filter((item) => item.is_active).length}</p></CardContent></Card><Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Baru bulan ini</p><p className="mt-2 text-2xl font-bold">{resource.data.filter((item) => item.created_at && new Date(item.created_at).getMonth() === new Date().getMonth() && new Date(item.created_at).getFullYear() === new Date().getFullYear()).length}</p></CardContent></Card></div><Card><CardHeader className="border-b"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle>Daftar {supplier ? "supplier" : "customer"}</CardTitle><CardDescription>Cari, tambah, edit, atau hapus data.</CardDescription></div><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama/kode/kontak" className="pl-9 sm:w-72" /></div></div></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Kode</TableHead><TableHead>Nama</TableHead>{supplier && <TableHead>Kontak</TableHead>}<TableHead>Email</TableHead><TableHead>Telepon</TableHead>{!supplier && <><TableHead>Total belanja</TableHead><TableHead>Store credit</TableHead></>}<TableHead>Status</TableHead><TableHead /></TableRow></TableHeader><TableBody>{resource.loading && <TableRow><TableCell colSpan={9} className="h-32 text-center"><Loader2 className="mx-auto animate-spin" /></TableCell></TableRow>}{!resource.loading && !visible.length && <TableRow><TableCell colSpan={9} className="h-32 text-center text-muted-foreground">Belum ada data.</TableCell></TableRow>}{visible.map((item) => <TableRow key={item.id}><TableCell>{item.code}</TableCell><TableCell className="font-medium">{item.name}</TableCell>{supplier && <TableCell>{item.contact_name || "—"}</TableCell>}<TableCell>{item.email || "—"}</TableCell><TableCell>{item.phone || "—"}</TableCell>{!supplier && <><TableCell>Rp {Number(item.total_spend_amount || 0).toLocaleString("id-ID")}</TableCell><TableCell>Rp {Number(item.store_credit_amount || 0).toLocaleString("id-ID")}</TableCell></>}<TableCell><Badge className={item.is_active ? "bg-emerald-600" : ""} variant={item.is_active ? "default" : "outline"}>{item.is_active ? "Aktif" : "Nonaktif"}</Badge></TableCell><TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => showEdit(item)}><Pencil className="size-4" /></Button><Button variant="ghost" size="icon" className="text-destructive" onClick={() => void remove(item)}><Trash2 className="size-4" /></Button></div></TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card><Dialog open={open} onOpenChange={setOpen}><DialogContent><form onSubmit={save}><DialogHeader><DialogTitle className="flex items-center gap-2"><Icon className="text-emerald-600" />{editing ? "Edit" : "Tambah"} {supplier ? "supplier" : "customer"}</DialogTitle><DialogDescription>Informasi dapat diperbarui kembali kapan saja.</DialogDescription></DialogHeader><div className="grid gap-4 py-5 sm:grid-cols-2"><div className="space-y-2"><Label>Kode</Label><Input value={form.code} onChange={update("code")} required /></div><div className="space-y-2"><Label>Nama</Label><Input value={form.name} onChange={update("name")} required /></div>{supplier && <div className="space-y-2 sm:col-span-2"><Label>Nama kontak</Label><Input value={form.contactName} onChange={update("contactName")} /></div>}<div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={update("email")} /></div><div className="space-y-2"><Label>Telepon</Label><Input value={form.phone} onChange={update("phone")} /></div><div className="space-y-2 sm:col-span-2"><Label>Alamat</Label><Input value={form.address} onChange={update("address")} /></div>{supplier ? <div className="space-y-2"><Label>Termin pembayaran (hari)</Label><Input type="number" min="0" value={form.paymentTermsDays} onChange={update("paymentTermsDays")} /></div> : <div className="space-y-2 sm:col-span-2"><Label>Catatan</Label><Input value={form.notes} onChange={update("notes")} /></div>}<div className="flex items-center justify-between rounded-lg border p-3"><Label>Aktif</Label><Switch checked={form.active} onCheckedChange={(value) => setForm((current) => ({ ...current, active: value }))} /></div></div><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button><Button className="bg-emerald-600 hover:bg-emerald-700" disabled={saving}>{saving && <Loader2 className="animate-spin" />} Simpan</Button></DialogFooter></form></DialogContent></Dialog></div>
}
