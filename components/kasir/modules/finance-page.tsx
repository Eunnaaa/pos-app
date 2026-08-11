"use client"

import { useCallback, useEffect, useState } from "react"
import { CalendarCheck, Loader2, LockKeyhole, RefreshCw, Unlock } from "lucide-react"
import { showError, showSuccess } from "@/lib/toast-handler"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { apiFetch } from "@/lib/client"
import { useOrganization } from "@/components/kasir/organization-provider"

type PeriodType = "day" | "month" | "year"
type ClosingTotals = { salesNet: string; profit: string; refunds: string; expenses: string; cashIn: string; cashOut: string; orders: number }
type ClosingPeriod = { id: string; periodType: PeriodType; periodKey: string; status: "closed" | "reopened"; closedAt?: string; reopenedAt?: string; reopenReason?: string; totals: Partial<ClosingTotals> }
type CashSession = { id: string; status: string; registerName: string; registerCode: string; openingAmount: string; expectedClosingAmount?: string; actualClosingAmount?: string; varianceAmount?: string; openedAt: string; closedAt?: string }
type FinanceOverview = { total_sales: string; total_profit: string; total_orders: number }

const rupiah = (value: string | number | undefined) => `Rp ${Number(value ?? 0).toLocaleString("id-ID")}`
const periodLabel: Record<PeriodType, string> = { day: "Harian", month: "Bulanan", year: "Tahunan" }

function defaultKey(type: PeriodType, now: Date) {
  const iso = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
  return type === "day" ? iso : type === "month" ? iso.slice(0, 7) : iso.slice(0, 4)
}

export function FinancePage() {
  const { branch } = useOrganization()
  const [periods, setPeriods] = useState<ClosingPeriod[]>([])
  const [sessions, setSessions] = useState<CashSession[]>([])
  const [overview, setOverview] = useState<FinanceOverview>({ total_sales: "0", total_profit: "0", total_orders: 0 })
  const [loading, setLoading] = useState(true)
  const [periodType, setPeriodType] = useState<PeriodType>("day")
  const [periodKey, setPeriodKey] = useState(() => defaultKey("day", new Date()))
  const [saving, setSaving] = useState(false)
  const [reopenTarget, setReopenTarget] = useState<ClosingPeriod>()
  const [reopenReason, setReopenReason] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [periodResponse, sessionResponse, overviewResponse] = await Promise.all([
        apiFetch<ClosingPeriod[]>("/api/v1/finance/closing"),
        apiFetch<CashSession[]>("/api/v1/finance/cash-sessions"),
        apiFetch<FinanceOverview>("/api/v1/finance/overview"),
      ])
      setPeriods(periodResponse.data)
      setSessions(sessionResponse.data)
      setOverview(overviewResponse.data)
    } catch (caught) { showError(caught instanceof Error ? caught.message : "Gagal memuat data keuangan") }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    void load()
    const handleContextChange = () => void load()
    window.addEventListener("kasir-ku-context-change", handleContextChange)
    return () => window.removeEventListener("kasir-ku-context-change", handleContextChange)
  }, [load])

  function changeType(next: PeriodType) {
    setPeriodType(next)
    setPeriodKey(defaultKey(next, new Date()))
  }

  async function closePeriod() {
    if (!branch) return showError("Pilih cabang terlebih dahulu")
    const field = periodType === "day" ? "date" : periodType
    setSaving(true)
    try {
      await apiFetch(`/api/v1/finance/closing/${periodType}`, { method: "POST", body: JSON.stringify({ branchId: branch.id, [field]: periodKey }) })
      showSuccess(`Periode ${periodLabel[periodType].toLowerCase()} ${periodKey} ditutup`)
      await load()
    } catch (caught) { showError(caught instanceof Error ? caught.message : "Tutup buku gagal") }
    finally { setSaving(false) }
  }

  async function submitReopen(event: React.FormEvent) {
    event.preventDefault()
    if (!reopenTarget) return
    setSaving(true)
    try {
      await apiFetch(`/api/v1/finance/closing/${reopenTarget.id}/reopen`, { method: "POST", body: JSON.stringify({ reason: reopenReason }) })
      showSuccess("Periode dibuka kembali")
      setReopenTarget(undefined); setReopenReason(""); await load()
    } catch (caught) { showError(caught instanceof Error ? caught.message : "Buka kembali gagal") }
    finally { setSaving(false) }
  }

  const openSessions = sessions.filter((session) => session.status === "open")
  const variance = sessions.reduce((sum, session) => sum + Number(session.varianceAmount ?? 0), 0)
  const closedPeriods = periods.filter((period) => period.status === "closed")

  return <div className="flex flex-1 flex-col gap-5 p-4 md:p-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-2xl font-bold">Keuangan &amp; Tutup Buku</h2>
        <p className="text-sm text-muted-foreground">Settlement shift kasir dan penutupan periode harian, bulanan, serta tahunan.</p>
      </div>
      <Button variant="outline" onClick={() => void load()}><RefreshCw /> Refresh</Button>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Penjualan hari ini</p><p className="mt-2 text-2xl font-bold">{rupiah(overview.total_sales)}</p></CardContent></Card>
      <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Laba hari ini</p><p className="mt-2 text-2xl font-bold text-emerald-600">{rupiah(overview.total_profit)}</p></CardContent></Card>
      <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Total selisih kas</p><p className={`mt-2 text-2xl font-bold ${variance === 0 ? "" : "text-rose-600"}`}>{rupiah(variance)}</p></CardContent></Card>
      <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Shift terbuka / Periode tertutup</p><p className="mt-2 text-2xl font-bold">{openSessions.length} / {closedPeriods.length}</p></CardContent></Card>
    </div>

    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2"><LockKeyhole className="size-4 text-emerald-600" /> Tutup buku</CardTitle>
        <CardDescription>Semua shift kasir harus settlement sebelum tutup buku harian. Bulanan butuh seluruh hari tertutup, tahunan butuh seluruh bulan tertutup.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 p-5 sm:grid-cols-[160px_1fr_auto] sm:items-end">
        <div className="space-y-2">
          <Label>Jenis periode</Label>
          <Select value={periodType} onValueChange={(value: PeriodType) => changeType(value)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{(Object.keys(periodLabel) as PeriodType[]).map((type) => <SelectItem key={type} value={type}>{periodLabel[type]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="period-key">{periodType === "day" ? "Tanggal" : periodType === "month" ? "Bulan (YYYY-MM)" : "Tahun (YYYY)"}</Label>
          <Input id="period-key" type={periodType === "day" ? "date" : periodType === "month" ? "month" : "number"} min={periodType === "year" ? "2000" : undefined} max={periodType === "year" ? "2999" : undefined} value={periodKey} onChange={(event) => setPeriodKey(event.target.value)} />
        </div>
        <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={saving || !periodKey || !branch} onClick={() => void closePeriod()}>
          {saving ? <Loader2 className="animate-spin" /> : <CalendarCheck />} Tutup periode
        </Button>
      </CardContent>
    </Card>

    <Card>
      <CardHeader className="border-b"><CardTitle>Riwayat periode</CardTitle><CardDescription>Audit trail penutupan dan pembukaan kembali.</CardDescription></CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Periode</TableHead><TableHead>Jenis</TableHead><TableHead>Order</TableHead><TableHead>Penjualan bersih</TableHead><TableHead>Laba</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={7} className="h-32 text-center"><Loader2 className="mx-auto animate-spin" /></TableCell></TableRow>}
              {!loading && !periods.length && <TableRow><TableCell colSpan={7} className="h-32 text-center text-muted-foreground">Belum ada periode yang ditutup.</TableCell></TableRow>}
              {periods.map((period) => <TableRow key={period.id}>
                <TableCell className="font-medium">{period.periodKey}</TableCell>
                <TableCell>{periodLabel[period.periodType]}</TableCell>
                <TableCell>{period.totals?.orders ?? 0}</TableCell>
                <TableCell>{rupiah(period.totals?.salesNet)}</TableCell>
                <TableCell>{rupiah(period.totals?.profit)}</TableCell>
                <TableCell><Badge variant={period.status === "closed" ? "default" : "outline"}>{period.status === "closed" ? "Ditutup" : "Dibuka kembali"}</Badge></TableCell>
                <TableCell className="text-right">
                  {period.status === "closed" && <Button size="sm" variant="outline" onClick={() => { setReopenTarget(period); setReopenReason("") }}><Unlock /> Buka kembali</Button>}
                </TableCell>
              </TableRow>)}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader className="border-b"><CardTitle>Settlement shift kasir</CardTitle><CardDescription>Rekonsiliasi kas per shift beserta selisihnya.</CardDescription></CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Mesin kasir</TableHead><TableHead>Dibuka</TableHead><TableHead>Ditutup</TableHead><TableHead>Kas awal</TableHead><TableHead>Ekspektasi</TableHead><TableHead>Aktual</TableHead><TableHead>Selisih</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={8} className="h-32 text-center"><Loader2 className="mx-auto animate-spin" /></TableCell></TableRow>}
              {!loading && !sessions.length && <TableRow><TableCell colSpan={8} className="h-32 text-center text-muted-foreground">Belum ada shift kasir. Buka shift dari menu POS.</TableCell></TableRow>}
              {sessions.map((session) => <TableRow key={session.id}>
                <TableCell className="font-medium">{session.registerName} • {session.registerCode}</TableCell>
                <TableCell>{new Date(session.openedAt).toLocaleString("id-ID")}</TableCell>
                <TableCell>{session.closedAt ? new Date(session.closedAt).toLocaleString("id-ID") : "—"}</TableCell>
                <TableCell>{rupiah(session.openingAmount)}</TableCell>
                <TableCell>{session.status === "open" ? "—" : rupiah(session.expectedClosingAmount)}</TableCell>
                <TableCell>{session.status === "open" ? "—" : rupiah(session.actualClosingAmount)}</TableCell>
                <TableCell className={Number(session.varianceAmount ?? 0) === 0 ? "" : "text-rose-600"}>{session.status === "open" ? "—" : rupiah(session.varianceAmount)}</TableCell>
                <TableCell><Badge variant={session.status === "open" ? "outline" : "default"}>{session.status === "open" ? "Terbuka" : "Settled"}</Badge></TableCell>
              </TableRow>)}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>

    <Dialog open={Boolean(reopenTarget)} onOpenChange={(open) => !open && setReopenTarget(undefined)}>
      <DialogContent>
        <form onSubmit={submitReopen}>
          <DialogHeader>
            <DialogTitle>Buka kembali periode {reopenTarget?.periodKey}</DialogTitle>
            <DialogDescription>Pembukaan kembali dicatat pada audit log. Periode induk yang masih tertutup harus dibuka lebih dahulu.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-5">
            <Label htmlFor="reopen-reason">Alasan</Label>
            <Textarea id="reopen-reason" value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} minLength={5} maxLength={1000} required placeholder="Jelaskan alasan pembukaan kembali periode" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReopenTarget(undefined)}>Batal</Button>
            <Button type="submit" variant="destructive" disabled={saving}>{saving && <Loader2 className="animate-spin" />} Buka kembali</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>
}
