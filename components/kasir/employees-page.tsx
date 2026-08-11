"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, RefreshCw, Store } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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

export function EmployeesCashierPage() {
  const [rows, setRows] = useState<CashierRecord[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await apiFetch<CashierRecord[]>("/api/v1/employees/cashiers")
      setRows(response.data)
    } catch (error) { showError(error instanceof Error ? error.message : "Gagal memuat karyawan") }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])
  const openShift = rows.filter((row) => row.shift_status === "open").length
  const inactiveCount = rows.filter((row) => !row.member_active).length

  return (
    <div className="flex flex-1 flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Karyawan</h2>
          <p className="text-sm text-muted-foreground">Daftar kasir dan status shift. Tambah kasir dari menu Cashier.</p>
        </div>
        <Button variant="outline" onClick={() => void load()}><RefreshCw /> Refresh</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Total kasir</p><p className="mt-2 text-2xl font-bold">{rows.length}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Shift aktif</p><p className="mt-2 text-2xl font-bold text-emerald-600">{openShift}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Nonaktif</p><p className="mt-2 text-2xl font-bold">{inactiveCount}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2"><Store className="size-4 text-emerald-600" /> Kasir &amp; Shift</CardTitle>
          <CardDescription>Status keanggotaan dan waktu buka/tutup shift terakhir.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Cabang</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Shift</TableHead>
                  <TableHead>Buka</TableHead>
                  <TableHead>Tutup</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center">
                      <Loader2 className="mx-auto animate-spin text-emerald-600" />
                    </TableCell>
                  </TableRow>
                )}
                {!loading && !rows.length && (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                      Belum ada kasir. Buat kasir dari menu Cashier.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((row) => (
                  <TableRow key={row.member_id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>{row.email}</TableCell>
                    <TableCell>{row.branch_names}</TableCell>
                    <TableCell>
                      <Badge variant={row.member_active ? "default" : "outline"} className={row.member_active ? "bg-emerald-600" : ""}>
                        {row.member_active ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {row.shift_status === "open" ? (
                        <Badge className="bg-emerald-600">Shift aktif</Badge>
                      ) : row.shift_status === "closed" ? (
                        <Badge variant="outline">Shift tutup</Badge>
                      ) : (
                        <Badge variant="outline">Belum shift</Badge>
                      )}
                    </TableCell>
                    <TableCell>{time(row.shift_opened_at)}</TableCell>
                    <TableCell>{time(row.shift_closed_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
