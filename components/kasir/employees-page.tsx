"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Clock,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  Store,
  Users,
  UserX,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { apiFetch } from "@/lib/client"
import { showError } from "@/lib/toast-handler"

type CashierRecord = {
  member_id: string
  member_active: boolean
  user_id: string
  name: string
  email: string
  branch_names: string
  shift_status: "open" | "closed" | null
  shift_opened_at: string | null
  shift_closed_at: string | null
}

const time = (value?: string | null) => (value ? new Date(value).toLocaleString("id-ID") : "—")

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

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await apiFetch<CashierRecord[]>("/api/v1/employees/cashiers")
      setRows(response.data)
    } catch (error) {
      showError(error instanceof Error ? error.message : "Gagal memuat karyawan")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openShift = rows.filter((row) => row.shift_status === "open").length
  const inactiveCount = rows.filter((row) => !row.member_active).length

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
          <h2 className="text-2xl font-bold text-foreground">Daftar Karyawan &amp; Kasir</h2>
          <p className="text-sm text-muted-foreground">Informasi staf, penugasan cabang, dan pemantauan shift aktif.</p>
        </div>
        <Button variant="outline" size="sm" className="h-9 gap-2 shadow-2xs" onClick={() => void load()}>
          <RefreshCw className="size-4" /> Refresh
        </Button>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="shadow-xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Staf / Kasir</p>
              <p className="mt-1.5 text-2xl font-bold text-foreground">{rows.length}</p>
            </div>
            <div className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Users className="size-5" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-emerald-200/60 bg-emerald-50/40 dark:border-emerald-900/60 dark:bg-emerald-950/20 shadow-xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">Shift Berjalan</p>
              <p className="mt-1.5 text-2xl font-bold text-emerald-700 dark:text-emerald-400">{openShift}</p>
            </div>
            <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
              <Clock className="size-5 animate-pulse" />
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Status Nonaktif</p>
              <p className="mt-1.5 text-2xl font-bold text-foreground">{inactiveCount}</p>
            </div>
            <div className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <UserX className="size-5" />
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
            placeholder="Cari staf, email, atau nama cabang..."
            className="pl-9 h-10 text-sm bg-background shadow-2xs"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-10 text-xs w-[160px] bg-background shadow-2xs">
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

      {/* Employee Cards Grid */}
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
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((employee, index) => {
            const initials = getInitials(employee.name)
            const colorClass = avatarColors[index % avatarColors.length]
            const isOpen = employee.shift_status === "open"

            return (
              <Card
                key={employee.member_id}
                className="group relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-400/80 hover:shadow-md bg-card border shadow-2xs flex flex-col justify-between"
              >
                <div>
                  {/* Card Header & Avatar */}
                  <CardHeader className="p-4 pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`flex size-11 shrink-0 items-center justify-center rounded-xl font-bold text-sm border shadow-2xs ${colorClass}`}
                        >
                          {initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <CardTitle className="truncate text-base font-bold text-foreground">
                            {employee.name}
                          </CardTitle>
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
                  </CardHeader>

                  {/* Card Body Info */}
                  <CardContent className="p-4 pt-0 space-y-3">
                    {/* Branch Assignment */}
                    <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-2.5 text-xs text-muted-foreground">
                      <Store className="size-4 shrink-0 text-emerald-600" />
                      <span className="truncate font-medium text-foreground">
                        {employee.branch_names || "Semua Cabang"}
                      </span>
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
                          Status Shift
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

