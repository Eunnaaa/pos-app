"use client"

import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Building2, Calendar, Download, Loader2, TrendingDown, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { apiFetch, getActiveContext } from "@/lib/client"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useOrganization } from "@/components/kasir/organization-provider"
import { showError, showSuccess } from "@/lib/toast-handler"
import type { SalesReport, InventoryReport, PurchaseReport, FinanceReport, CustomerReport } from "@/lib/services/reporting"
import { exportToCsv } from "@/lib/utils/export-csv"

const rupiah = (value: string | number) => `Rp ${Math.round(Number(value) || 0).toLocaleString("id-ID")}`

interface ReportPageProps {
  reportType: "sales" | "inventory" | "purchases" | "finance" | "customers"
  title: string
}

export function ReportPage({ reportType, title }: ReportPageProps) {
  const { branch, organization, selectBranch, selectAllBranches } = useOrganization()
  const searchParams = useSearchParams()
  const [report, setReport] = useState<SalesReport | InventoryReport | PurchaseReport | FinanceReport | CustomerReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [selectedBranchId, setSelectedBranchId] = useState<string>(() => {
    const active = getActiveContext()
    return active.branchId || branch?.id || "all"
  })
  const [startDate, setStartDate] = useState(searchParams.get("startDate") || "")
  const [endDate, setEndDate] = useState(searchParams.get("endDate") || "")

  useEffect(() => {
    if (branch?.id) {
      setSelectedBranchId(branch.id)
    } else {
      setSelectedBranchId("all")
    }
  }, [branch?.id])

  useEffect(() => {
    const handleContextChange = () => {
      const active = getActiveContext()
      setSelectedBranchId(active.branchId || "all")
    }
    window.addEventListener("kedai-ku-context-change", handleContextChange)
    return () => window.removeEventListener("kedai-ku-context-change", handleContextChange)
  }, [])

  const handleBranchChange = (value: string) => {
    setSelectedBranchId(value)
    if (value === "all") {
      selectAllBranches()
    } else {
      selectBranch(value)
    }
  }

  const fetchReport = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const params = new URLSearchParams()
      if (startDate) params.append("startDate", new Date(`${startDate}T00:00:00`).toISOString())
      if (endDate) params.append("endDate", new Date(`${endDate}T23:59:59.999`).toISOString())
      params.append("branchId", selectedBranchId)
      const targetBranchId = selectedBranchId === "all" ? null : selectedBranchId
      const response = await apiFetch<SalesReport | InventoryReport | PurchaseReport | FinanceReport | CustomerReport>(
        `/api/v1/reports/${reportType}?${params.toString()}`,
        { branchId: targetBranchId }
      )
      setReport(response.data)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Gagal memuat laporan"
      setError(message)
      showError(message)
    } finally {
      setLoading(false)
    }
  }, [reportType, startDate, endDate, selectedBranchId])

  useEffect(() => {
    void fetchReport()
  }, [fetchReport])

  const handleExport = () => {
    if (!report) return
    try {
      const activeBranchName = selectedBranchId === "all" ? "semua-cabang" : (organization?.branches.find((b) => b.id === selectedBranchId)?.name || "cabang").toLowerCase().replace(/\s+/g, "-")
      const dateStr = new Date().toISOString().slice(0, 10)
      const baseFilename = `laporan-${reportType}-${activeBranchName}-${dateStr}`

      if (reportType === "sales") {
        const salesRep = report as SalesReport
        if (salesRep.byProduct && salesRep.byProduct.length > 0) {
          exportToCsv(
            `${baseFilename}-produk-terlaris`,
            salesRep.byProduct,
            [
              { header: "Nama Produk", accessor: (i) => i.name },
              { header: "Kuantitas Terjual", accessor: (i) => i.quantity },
              { header: "Penjualan Bersih (Rp)", accessor: (i) => Number(i.sales) },
              { header: "Laba Kotor (Rp)", accessor: (i) => Number(i.profit) },
            ]
          )
        } else {
          exportToCsv(
            baseFilename,
            [salesRep.summary],
            [
              { header: "Penjualan Bersih (Rp)", accessor: (s) => Number(s.totalSales) },
              { header: "Laba Kotor (Rp)", accessor: (s) => Number(s.totalProfit) },
              { header: "Total Transaksi", accessor: (s) => s.totalOrders },
              { header: "Rata-rata Transaksi (Rp)", accessor: (s) => Number(s.averageOrderValue) },
              { header: "Jumlah Pelanggan Unik", accessor: (s) => s.uniqueCustomers },
            ]
          )
        }
      } else if (reportType === "inventory") {
        const invRep = report as InventoryReport
        exportToCsv(
          baseFilename,
          invRep.movements || [],
          [
            { header: "Tipe Mutasi", accessor: (i) => i.type },
            { header: "Jumlah Kuantitas", accessor: (i) => i.quantity },
            { header: "Total Nilai (Rp)", accessor: (i) => Number(i.value) },
            { header: "Total Kejadian", accessor: (i) => i.count },
          ]
        )
      } else if (reportType === "customers") {
        const custRep = report as CustomerReport
        exportToCsv(
          baseFilename,
          custRep.topCustomers || [],
          [
            { header: "Nama Pelanggan", accessor: (c) => c.name },
            { header: "Total Belanja (Rp)", accessor: (c) => Number(c.spent) },
            { header: "Jumlah Kunjungan/Order", accessor: (c) => c.orders },
            { header: "Poin Loyalitas", accessor: (c) => c.points },
          ]
        )
      } else {
        // Generic structured export
        exportToCsv(
          baseFilename,
          [report as unknown as Record<string, unknown>],
          Object.keys(report).map((k) => ({
            header: k.toUpperCase(),
            accessor: (item: Record<string, unknown>) => typeof item[k] === "object" ? JSON.stringify(item[k]) : String(item[k]),
          }))
        )
      }

      showSuccess("Laporan Excel/CSV berhasil diunduh!")
    } catch (caught) {
      showError(caught instanceof Error ? caught.message : "Gagal mengekspor laporan")
    }
  }

  const currentBranchLabel = selectedBranchId === "all"
    ? "Semua Cabang (Konsolidasi)"
    : (organization?.branches.find((b) => b.id === selectedBranchId)?.name || "Cabang Aktif")

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:px-6 md:pb-6 md:pt-4">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">{title}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Laporan terperinci dan analitik bisnis per cabang.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1.5 py-1.5 pl-3 pr-3.5 text-xs">
            <Building2 className="size-3.5 text-muted-foreground" />
            {currentBranchLabel}
          </Badge>
          <Button onClick={handleExport} disabled={!report} variant="outline" size="sm">
            <Download className="mr-1.5 size-3.5" />
            Export CSV
          </Button>
        </div>
      </section>

      <Card className="py-2.5 px-3 sm:px-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          {organization && organization.branches.length > 0 && (
            <div className="flex-1">
              <label className="text-xs font-semibold text-muted-foreground">Pilih Cabang</label>
              <Select value={selectedBranchId} onValueChange={handleBranchChange}>
                <SelectTrigger className="w-full mt-1 rounded-lg h-9 text-xs">
                  <SelectValue placeholder="Pilih Cabang" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">🌐 Semua Cabang (Konsolidasi)</SelectItem>
                  {organization.branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      🏬 {b.name} ({b.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex-1">
            <label className="text-xs font-semibold text-muted-foreground">Dari tanggal</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full mt-1 rounded-lg border px-3 py-1.5 text-xs h-9 bg-background"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs font-semibold text-muted-foreground">Sampai tanggal</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full mt-1 rounded-lg border px-3 py-1.5 text-xs h-9 bg-background"
            />
          </div>
          <div>
            <Button onClick={fetchReport} className="w-full h-9 text-xs bg-emerald-600 hover:bg-emerald-700 font-semibold gap-1.5">
              <Calendar className="size-3.5" />
              Terapkan Filter
            </Button>
          </div>
        </div>
      </Card>

      {error ? (
        <Card className="border-destructive/40">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      {loading ? (
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="size-8 animate-spin text-emerald-600" />
        </div>
      ) : report ? (
        <ReportContent report={report} reportType={reportType} />
      ) : null}
    </div>
  )
}

function ReportContent({
  report,
  reportType,
}: {
  report: SalesReport | InventoryReport | PurchaseReport | FinanceReport | CustomerReport
  reportType: "sales" | "inventory" | "purchases" | "finance" | "customers"
}) {
  switch (reportType) {
    case "sales":
      return <SalesReportContent report={report as SalesReport} />
    case "inventory":
      return <InventoryReportContent report={report as InventoryReport} />
    case "purchases":
      return <PurchaseReportContent report={report as PurchaseReport} />
    case "finance":
      return <FinanceReportContent report={report as FinanceReport} />
    case "customers":
      return <CustomerReportContent report={report as CustomerReport} />
    default:
      return null
  }
}

function SalesReportContent({ report }: { report: SalesReport }) {
  const summary = report.summary
  const trend = Number(summary.totalSales) > 0

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Penjualan Bersih"
          value={rupiah(summary.totalSales)}
          trend={trend}
          icon={TrendingUp}
        />
        <MetricCard
          label="Laba Kotor"
          value={rupiah(summary.totalProfit)}
          trend={trend}
          icon={TrendingUp}
        />
        <MetricCard label="Total Order" value={String(summary.totalOrders)} icon={TrendingUp} />
        <MetricCard
          label="Rata-rata Order"
          value={rupiah(summary.averageOrderValue)}
          icon={TrendingUp}
        />
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tren Penjualan per Jam</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {report.hourly.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between rounded-lg border p-3">
                  <span className="text-sm">{item.hour}</span>
                  <span className="font-semibold">{rupiah(item.sales)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Metode Pembayaran</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {report.byPaymentMethod.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{item.method}</p>
                    <p className="text-xs text-muted-foreground">{item.count} transaksi</p>
                  </div>
                  <p className="font-semibold">{rupiah(item.amount)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Produk Terlaris</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-semibold">Produk</th>
                  <th className="text-right py-2 font-semibold">Qty</th>
                  <th className="text-right py-2 font-semibold">Penjualan Bersih</th>
                  <th className="text-right py-2 font-semibold">Laba Kotor</th>
                </tr>
              </thead>
              <tbody>
                {report.byProduct.map((item, idx) => (
                  <tr key={idx} className="border-b hover:bg-muted/50">
                    <td className="py-3">{item.name}</td>
                    <td className="text-right">{item.quantity}</td>
                    <td className="text-right font-medium">{rupiah(item.sales)}</td>
                    <td className="text-right font-medium text-emerald-600">{rupiah(item.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pelanggan Terbaik</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-semibold">Pelanggan</th>
                  <th className="text-right py-2 font-semibold">Order</th>
                  <th className="text-right py-2 font-semibold">Total</th>
                  <th className="text-right py-2 font-semibold">Poin</th>
                </tr>
              </thead>
              <tbody>
                {report.byCustomer.map((item, idx) => (
                  <tr key={idx} className="border-b hover:bg-muted/50">
                    <td className="py-3">{item.name}</td>
                    <td className="text-right">{item.orders}</td>
                    <td className="text-right font-medium">{rupiah(item.total)}</td>
                    <td className="text-right font-medium text-blue-600">{rupiah(item.points)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function InventoryReportContent({ report }: { report: InventoryReport }) {
  const summary = report.summary

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total SKU" value={String(summary.totalSKUs)} icon={TrendingUp} />
        <MetricCard label="Total Nilai Stok" value={rupiah(summary.totalValue)} icon={TrendingUp} />
        <MetricCard
          label="Stok Rendah"
          value={String(summary.lowStockItems)}
          trend={false}
          icon={TrendingDown}
        />
        <MetricCard
          label="Kosong"
          value={String(summary.outOfStockItems)}
          trend={false}
          icon={TrendingDown}
        />
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stok Berdasarkan Kategori</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {report.byCategory.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.items} item</p>
                  </div>
                  <p className="text-right">
                    <span className="block font-semibold">{rupiah(item.value)}</span>
                    <span className="text-xs text-muted-foreground">{item.quantity} unit</span>
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pergerakan Stok</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {report.movements.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Badge variant="outline">{item.type}</Badge>
                    <p className="mt-1 text-xs text-muted-foreground">{item.count} pergerakan</p>
                  </div>
                  <p className="text-right">
                    <span className="block font-semibold">{rupiah(item.value)}</span>
                    <span className="text-xs">{item.quantity} unit</span>
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rotasi Stok</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-semibold">Produk</th>
                  <th className="text-right py-2 font-semibold">Tingkat Rotasi</th>
                  <th className="text-right py-2 font-semibold">Hari di Stok</th>
                </tr>
              </thead>
              <tbody>
                {report.turnover.map((item, idx) => (
                  <tr key={idx} className="border-b hover:bg-muted/50">
                    <td className="py-3">{item.name}</td>
                    <td className="text-right font-medium">{item.turnover_rate}</td>
                    <td className="text-right">{item.days_in_stock} hari</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function PurchaseReportContent({ report }: { report: PurchaseReport }) {
  const summary = report.summary

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total PO" value={String(summary.totalOrders)} icon={TrendingUp} />
        <MetricCard label="Total Amount" value={rupiah(summary.totalAmount)} icon={TrendingUp} />
        <MetricCard label="Received" value={rupiah(summary.totalReceivedAmount)} icon={TrendingUp} />
        <MetricCard
          label="Pending"
          value={rupiah(summary.pendingAmount)}
          trend={false}
          icon={TrendingDown}
        />
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Berdasarkan Supplier</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {report.bySupplier.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">Rata-rata {item.avg_days} hari</p>
                  </div>
                  <p className="text-right">
                    <span className="block font-semibold">{rupiah(item.amount)}</span>
                    <span className="text-xs">{item.orders} PO</span>
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status PO</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {report.byStatus.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between rounded-lg border p-3">
                  <Badge variant="outline">{item.status}</Badge>
                  <p className="text-right">
                    <span className="block font-semibold">{rupiah(item.amount)}</span>
                    <span className="text-xs text-muted-foreground">{item.count} order</span>
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Timeline Penerimaan</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {report.receivingTimeline.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm font-medium">{item.date}</span>
                <span className="text-right">
                  <span className="block font-semibold">{item.quantity} unit</span>
                  <span className="text-xs text-muted-foreground">{item.orders} order</span>
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function FinanceReportContent({ report }: { report: FinanceReport }) {
  const summary = report.summary
  const profit = Number(summary.profit)

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Penjualan" value={rupiah(summary.totalSales)} icon={TrendingUp} />
        <MetricCard label="Pendapatan" value={rupiah(summary.income)} icon={TrendingUp} />
        <MetricCard
          label="Pengeluaran"
          value={rupiah(summary.expenses)}
          trend={false}
          icon={TrendingDown}
        />
        <MetricCard
          label="Profit"
          value={rupiah(summary.profit)}
          trend={profit > 0}
          icon={profit > 0 ? TrendingUp : TrendingDown}
        />
      </section>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Laba Penjualan" value={rupiah(summary.salesProfit)} icon={TrendingUp} />
        <MetricCard label="Total Order" value={String(summary.totalOrders)} icon={TrendingUp} />
        <MetricCard label="Margin Profit" value={`${summary.profitMargin}%`} icon={TrendingUp} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Saldo Kas</CardTitle>
          <CardDescription>Posisi kas terkini</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold text-emerald-600">{rupiah(summary.cashBalance)}</p>
        </CardContent>
      </Card>

      <section className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Breakdown Pendapatan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {report.incomeBreakdown.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{item.category}</p>
                    <p className="text-xs text-muted-foreground">{item.percentage}%</p>
                  </div>
                  <p className="font-semibold">{rupiah(item.amount)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Breakdown Pengeluaran</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {report.expenseBreakdown.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{item.category}</p>
                    <p className="text-xs text-muted-foreground">{item.percentage}%</p>
                  </div>
                  <p className="font-semibold">{rupiah(item.amount)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Akun Keuangan</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-semibold">Akun</th>
                  <th className="text-right py-2 font-semibold">Debit</th>
                  <th className="text-right py-2 font-semibold">Kredit</th>
                  <th className="text-right py-2 font-semibold">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {report.byAccount.map((item, idx) => (
                  <tr key={idx} className="border-b hover:bg-muted/50">
                    <td className="py-3">{item.name}</td>
                    <td className="text-right">{rupiah(item.debit)}</td>
                    <td className="text-right">{rupiah(item.credit)}</td>
                    <td className="text-right font-semibold">{rupiah(item.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function CustomerReportContent({ report }: { report: CustomerReport }) {
  const summary = report.summary

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Pelanggan" value={String(summary.totalCustomers)} icon={TrendingUp} />
        <MetricCard label="Pelanggan Baru" value={String(summary.newCustomers)} icon={TrendingUp} />
        <MetricCard label="Pelanggan Aktif" value={String(summary.activeCustomers)} icon={TrendingUp} />
        <MetricCard label="Total Pengeluaran" value={rupiah(summary.totalSpent)} icon={TrendingUp} />
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Segmentasi Pelanggan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {report.bySegment.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Badge variant="outline">{item.segment}</Badge>
                    <p className="mt-1 text-xs text-muted-foreground">Freq: {item.frequency}x</p>
                  </div>
                  <p className="text-right">
                    <span className="block font-semibold">{rupiah(item.spent)}</span>
                    <span className="text-xs">{item.count} orang</span>
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Berdasarkan Lifetime Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {report.byLifetime.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-medium text-sm">{item.range}</p>
                    <p className="text-xs text-muted-foreground">Freq: {item.avg_frequency}x</p>
                  </div>
                  <p className="text-right">
                    <span className="block font-semibold">{rupiah(item.spent)}</span>
                    <span className="text-xs">{item.count} orang</span>
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pelanggan Terbaik</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-semibold">Nama</th>
                  <th className="text-right py-2 font-semibold">Order</th>
                  <th className="text-right py-2 font-semibold">Total</th>
                  <th className="text-right py-2 font-semibold">Poin</th>
                </tr>
              </thead>
              <tbody>
                {report.topCustomers.map((item, idx) => (
                  <tr key={idx} className="border-b hover:bg-muted/50">
                    <td className="py-3">{item.name}</td>
                    <td className="text-right">{item.orders}</td>
                    <td className="text-right font-medium">{rupiah(item.spent)}</td>
                    <td className="text-right font-medium text-blue-600">{rupiah(item.points)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

interface MetricCardProps {
  label: string
  value: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  trend?: boolean
}

function MetricCard({ label, value, icon: Icon, trend }: MetricCardProps) {
  return (
    <Card className="py-3 shadow-sm">
      <CardContent className="px-4 py-0 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-xl font-bold tracking-tight">{value}</p>
        </div>
        <div
          className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
            trend === false
              ? "bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-300"
              : "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300"
          }`}
        >
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  )
}
