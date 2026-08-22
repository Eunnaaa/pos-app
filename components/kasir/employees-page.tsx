"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Award,
  CheckCircle2,
  Clock,
  DollarSign,
  Flame,
  LayoutGrid,
  List,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  Store,
  TrendingUp,
  Users,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { apiFetch } from "@/lib/client"
import { showError } from "@/lib/toast-handler"

type CashierRecord = {
  member_id: string
  member_active: boolean
  member_role?: string
  user_id: string
  name: string
  email: string
  branch_names: string
  shift_status: "open" | "closed" | null
  shift_opened_at: string | null
  shift_closed_at: string | null
  total_orders?: number
  total_sales?: string
  total_shifts?: number
  total_variance?: string
  avg_order_value?: string
  perfect_shifts?: number
}

const rupiah = (value?: string | number | null) => `Rp ${Number(value ?? 0).toLocaleString("id-ID")}`
const time = (value?: string | null) => (value ? new Date(value).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" }) : "—")

function getInitials(name: string) {
  if (!name) return "K"
  const parts = name.trim().split(" ")
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

export function EmployeesCashierPage() {
  const [rows, setRows] = useState<CashierRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await apiFetch<CashierRecord[]>("/api/v1/employees/cashiers")
      setRows(response.data)
    } catch (error) {
      showError(error instanceof Error ? error.message : "Gagal memuat data KPI karyawan")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openShift = rows.filter((row) => row.shift_status === "open").length
  const totalSalesAll = rows.reduce((acc, row) => acc + BigInt(row.total_sales || "0"), 0n)
  const totalOrdersAll = rows.reduce((acc, row) => acc + (row.total_orders || 0), 0)
  const totalShiftsAll = rows.reduce((acc, row) => acc + (row.total_shifts || 0), 0)
  const perfectShiftsAll = rows.reduce((acc, row) => acc + (row.perfect_shifts || 0), 0)
  const overallAccuracy = totalShiftsAll > 0 ? Math.round((perfectShiftsAll / totalShiftsAll) * 100) : 100

  // Identify highest sales and order volume
  const maxSales = Math.max(...rows.map((r) => Number(r.total_sales || 0)), 0)
  const maxOrders = Math.max(...rows.map((r) => r.total_orders || 0), 0)

  const filtered = rows.filter((row) => {
    const matchSearch =
      row.name.toLowerCase().includes(search.toLowerCase()) ||
      row.email.toLowerCase().includes(search.toLowerCase()) ||
      row.branch_names.toLowerCase().includes(search.toLowerCase())

    if (statusFilter === "open") return matchSearch && row.shift_status === "open"
    if (statusFilter === "active") return matchSearch && row.member_active
    if (statusFilter === "inactive") return matchSearch && !row.member_active
    return matchSearch
  })

  const avatarColors = [
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800",
    "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border-purple-200 dark:border-purple-800",
    "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  ]

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      {/* Header Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Daftar Karyawan &amp; KPI Performa</h2>
          <p className="text-sm text-muted-foreground">
            Evaluasi pencapaian omzet, produktivitas transaksi, akurasi kas, dan monitoring shift kasir.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 sm:ml-auto">
          <div className="flex items-center rounded-xl border bg-muted/30 p-0.5">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 px-2.5 rounded-lg text-xs gap-1.5"
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="size-3.5" /> Kartu KPI
            </Button>
            <Button
              variant={viewMode === "table" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 px-2.5 rounded-lg text-xs gap-1.5"
              onClick={() => setViewMode("table")}
            >
              <List className="size-3.5" /> Ranking &amp; Tabel
            </Button>
          </div>
          <Button variant="outline" size="sm" className="h-9 gap-2 shadow-2xs rounded-xl" onClick={() => void load()}>
            <RefreshCw className="size-4" /> Refresh
          </Button>
        </div>
      </div>

      {/* KPI Global Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Karyawan */}
        <Card className="shadow-xs rounded-2xl">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Kasir / Staf</p>
              <p className="mt-1.5 text-2xl font-bold text-foreground">{rows.length}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {rows.filter((r) => r.member_active).length} aktif bertugas
              </p>
            </div>
            <div className="flex size-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <Users className="size-5" />
            </div>
          </CardContent>
        </Card>

        {/* Shift Aktif */}
        <Card className="border-emerald-200/60 bg-emerald-50/40 dark:border-emerald-900/60 dark:bg-emerald-950/20 shadow-xs rounded-2xl">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">Shift Aktif</p>
              <p className="mt-1.5 text-2xl font-bold text-emerald-700 dark:text-emerald-400">{openShift}</p>
              <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">
                Sedang melayani pelanggan
              </p>
            </div>
            <div className="flex size-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
              <Clock className="size-5 animate-pulse" />
            </div>
          </CardContent>
        </Card>

        {/* Total Omzet Kasir */}
        <Card className="shadow-xs rounded-2xl">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Omzet Kasir</p>
              <p className="mt-1.5 text-2xl font-bold text-foreground">{rupiah(totalSalesAll.toString())}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {totalOrdersAll} transaksi diselesaikan
              </p>
            </div>
            <div className="flex size-11 items-center justify-center rounded-2xl bg-emerald-100/80 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <DollarSign className="size-5" />
            </div>
          </CardContent>
        </Card>

        {/* Akurasi Kas Shift */}
        <Card className="shadow-xs rounded-2xl">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Akurasi Kas Shift</p>
              <p className="mt-1.5 text-2xl font-bold text-foreground">{overallAccuracy}%</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {perfectShiftsAll} dari {totalShiftsAll} shift seimbang (Rp 0)
              </p>
            </div>
            <div className="flex size-11 items-center justify-center rounded-2xl bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              <CheckCircle2 className="size-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar: Search & Filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama karyawan, email, atau cabang..."
            className="pl-9 h-10 text-sm bg-background shadow-2xs rounded-xl"
          />
        </div>
        <div className="flex items-center justify-end gap-2 sm:ml-auto">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-10 text-xs w-[170px] bg-background shadow-2xs rounded-xl">
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Karyawan</SelectItem>
              <SelectItem value="open">Shift Aktif</SelectItem>
              <SelectItem value="active">Status Aktif</SelectItem>
              <SelectItem value="inactive">Status Nonaktif</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content Area: Grid vs Table */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="size-8 animate-spin text-emerald-600" />
        </div>
      ) : !filtered.length ? (
        <div className="flex h-64 flex-col items-center justify-center text-center rounded-2xl border border-dashed bg-card p-6">
          <Users className="size-12 text-muted-foreground/30" />
          <p className="mt-4 font-semibold text-foreground">Tidak ada karyawan ditemukan</p>
          <p className="text-xs text-muted-foreground mt-1">Coba sesuaikan kata kunci pencarian atau filter status.</p>
        </div>
      ) : viewMode === "table" ? (
        /* Table / Leaderboard View */
        <Card className="rounded-2xl shadow-xs overflow-hidden border">
          <CardHeader className="p-4 border-b bg-muted/20">
            <CardTitle className="text-base flex items-center gap-2 font-bold">
              <TrendingUp className="size-4 text-emerald-600" /> Ranking &amp; Performa Kasir
            </CardTitle>
            <CardDescription className="text-xs">
              Urutan kasir berdasarkan kontribusi penjualan tertinggi sepanjang masa.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">Rank</TableHead>
                  <TableHead>Karyawan / Kasir</TableHead>
                  <TableHead>Cabang</TableHead>
                  <TableHead className="text-right">Total Omzet</TableHead>
                  <TableHead className="text-center">Order</TableHead>
                  <TableHead className="text-right">Rata-rata Order</TableHead>
                  <TableHead className="text-center">Total Shift</TableHead>
                  <TableHead className="text-center">Akurasi Kas</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((emp, index) => {
                  const sales = Number(emp.total_sales || 0)
                  const orders = emp.total_orders || 0
                  const shifts = emp.total_shifts || 0
                  const variance = BigInt(emp.total_variance || "0")
                  const isTopSales = sales > 0 && sales === maxSales
                  const isTopOrders = orders > 0 && orders === maxOrders

                  return (
                    <TableRow key={emp.member_id} className="hover:bg-muted/40">
                      <TableCell className="text-center font-bold">
                        {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `#${index + 1}`}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 font-bold text-xs">
                            {getInitials(emp.name)}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 font-semibold text-sm">
                              {emp.name}
                              {isTopSales && <Badge className="bg-amber-500 text-[10px] px-1.5 py-0 h-4">Top Sales</Badge>}
                              {isTopOrders && !isTopSales && <Badge className="bg-emerald-600 text-[10px] px-1.5 py-0 h-4">Top Order</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground">{emp.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{emp.branch_names}</TableCell>
                      <TableCell className="text-right font-bold text-emerald-600">{rupiah(emp.total_sales)}</TableCell>
                      <TableCell className="text-center font-semibold text-xs">{orders} order</TableCell>
                      <TableCell className="text-right text-xs font-medium">{rupiah(emp.avg_order_value)}</TableCell>
                      <TableCell className="text-center text-xs font-medium">{shifts} sesi</TableCell>
                      <TableCell className="text-center">
                        {variance === 0n ? (
                          <Badge variant="outline" className="text-emerald-700 border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-[11px]">
                            Seimbang (Rp 0)
                          </Badge>
                        ) : variance < 0n ? (
                          <Badge variant="outline" className="text-rose-600 border-rose-200 bg-rose-50 dark:bg-rose-950/40 text-[11px]">
                            {rupiah(variance.toString())}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 dark:bg-amber-950/40 text-[11px]">
                            +{rupiah(variance.toString())}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {emp.shift_status === "open" ? (
                          <Badge className="bg-emerald-600 text-[10px] gap-1">
                            <span className="size-1.5 rounded-full bg-white animate-pulse" />
                            Shift Aktif
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            {emp.member_active ? "Tutup" : "Nonaktif"}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        /* Cards KPI Grid View */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((employee, index) => {
            const initials = getInitials(employee.name)
            const colorClass = avatarColors[index % avatarColors.length]
            const isOpen = employee.shift_status === "open"
            const sales = Number(employee.total_sales || 0)
            const orders = employee.total_orders || 0
            const shifts = employee.total_shifts || 0
            const variance = BigInt(employee.total_variance || "0")
            const isTopSales = sales > 0 && sales === maxSales
            const isTopOrders = orders > 0 && orders === maxOrders

            return (
              <Card
                key={employee.member_id}
                className="group relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-400/80 hover:shadow-md bg-card border shadow-2xs flex flex-col justify-between rounded-2xl"
              >
                <div>
                  {/* Card Header & Avatar */}
                  <CardHeader className="p-4 pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`flex size-11 shrink-0 items-center justify-center rounded-2xl font-bold text-sm border shadow-2xs ${colorClass}`}
                        >
                          {initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <CardTitle className="truncate text-base font-bold text-foreground">
                              {employee.name}
                            </CardTitle>
                          </div>
                          <p className="truncate text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Mail className="size-3 shrink-0" />
                            <span className="truncate">{employee.email}</span>
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant={employee.member_active ? "default" : "outline"}
                        className={employee.member_active ? "bg-emerald-600 text-[10px] shrink-0" : "text-[10px] shrink-0"}
                      >
                        {employee.member_active ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </div>

                    {/* Achievement Badges */}
                    {(isTopSales || isTopOrders) && (
                      <div className="flex items-center gap-1.5 mt-2">
                        {isTopSales && (
                          <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-[10px] gap-1 px-2 py-0.5">
                            <Flame className="size-3" /> Top Sales
                          </Badge>
                        )}
                        {isTopOrders && (
                          <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] gap-1 px-2 py-0.5">
                            <Award className="size-3" /> Top Order
                          </Badge>
                        )}
                      </div>
                    )}
                  </CardHeader>

                  {/* Card Body Info */}
                  <CardContent className="p-4 pt-0 space-y-3">
                    {/* Branch Assignment */}
                    <div className="flex items-center gap-2 rounded-xl bg-muted/50 p-2.5 text-xs text-muted-foreground">
                      <Store className="size-4 shrink-0 text-emerald-600" />
                      <span className="truncate font-medium text-foreground">
                        {employee.branch_names || "Semua Cabang"}
                      </span>
                    </div>

                    {/* Employee KPI Mini Matrix */}
                    <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/30 p-2.5 text-xs border">
                      <div>
                        <span className="text-[10px] text-muted-foreground block">Total Omzet</span>
                        <span className="font-bold text-emerald-700 dark:text-emerald-400 text-sm block">
                          {rupiah(employee.total_sales)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground block">Order Terlayani</span>
                        <span className="font-bold text-foreground text-sm block">
                          {orders} order
                        </span>
                      </div>
                      <div className="border-t pt-1.5">
                        <span className="text-[10px] text-muted-foreground block">Rata-rata Order</span>
                        <span className="font-medium text-foreground text-xs block">
                          {rupiah(employee.avg_order_value)}
                        </span>
                      </div>
                      <div className="border-t pt-1.5">
                        <span className="text-[10px] text-muted-foreground block">Akurasi Selisih</span>
                        <span className={`font-semibold text-xs block ${variance === 0n ? "text-emerald-600" : "text-rose-600"}`}>
                          {variance === 0n ? "Seimbang (Rp 0)" : rupiah(variance.toString())}
                        </span>
                      </div>
                    </div>

                    {/* Shift Status Block */}
                    <div
                      className={`rounded-xl border p-3 space-y-1.5 text-xs ${
                        isOpen
                          ? "bg-emerald-50/70 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900"
                          : "bg-muted/40 border-border"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">
                          Status Shift ({shifts} sesi)
                        </span>
                        {isOpen ? (
                          <Badge className="bg-emerald-600 text-[10px] gap-1 py-0 px-2">
                            <span className="size-1.5 rounded-full bg-white animate-pulse" />
                            Shift Aktif
                          </Badge>
                        ) : employee.shift_status === "closed" ? (
                          <Badge variant="outline" className="text-[10px] py-0 px-2">
                            Shift Tutup
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground py-0 px-2">
                            Belum Shift
                          </Badge>
                        )}
                      </div>

                      {isOpen && (
                        <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                          Buka: {time(employee.shift_opened_at)}
                        </p>
                      )}

                      {!isOpen && employee.shift_closed_at && (
                        <p className="text-[11px] text-muted-foreground">
                          Terakhir tutup: {time(employee.shift_closed_at)}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}


