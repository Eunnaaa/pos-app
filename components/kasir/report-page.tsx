"use client"

import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Building2, Calendar, Download, Loader2, TrendingDown, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { apiFetch } from "@/lib/client"
import { useOrganization } from "@/components/kasir/organization-provider"
import type { SalesReport, InventoryReport, PurchaseReport, FinanceReport, CustomerReport } from "@/lib/services/reporting"

const rupiah = (value: string | number) => `Rp ${Number(value).toLocaleString("id-ID")}`

interface ReportPageProps {
  reportType: "sales" | "inventory" | "purchases" | "finance" | "customers"
  title: string
}

export function ReportPage({ reportType, title }: ReportPageProps) {
  const { branch } = useOrganization()
  const searchParams = useSearchParams()
  const [report, setReport] = useState<SalesReport | InventoryReport | PurchaseReport | FinanceReport | CustomerReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [startDate, setStartDate] = useState(searchParams.get("startDate") || "")
  const [endDate, setEndDate] = useState(searchParams.get("endDate") || "")

  const fetchReport = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const params = new URLSearchParams()
      if (startDate) params.append("startDate", new Date(`${startDate}T00:00:00`).toISOString())
      if (endDate) params.append("endDate", new Date(`${endDate}T23:59:59.999`).toISOString())
      const response = await apiFetch<SalesReport | InventoryReport | PurchaseReport | FinanceReport | CustomerReport>(`/api/v1/reports/${reportType}?${params.toString()}`, { branchId: branch?.id })
      setReport(response.data)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Gagal memuat laporan")
    } finally {
      setLoading(false)
    }
  }, [reportType, startDate, endDate, branch?.id])

  useEffect(() => {
    void fetchReport()
  }, [fetchReport])

  const handleExport = () => {
    if (!report) return
    const rows = Object.entries(report).flatMap(([section, value]) => {
      if (!Array.isArray(value)) return [[section, typeof value === "object" ? JSON.stringify(value) : String(value)]]
      return value.map((item) => [section, JSON.stringify(item)])
    })
    const csv = [["section", "value"], ...rows]
      .map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","))
      .join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${reportType}-report-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="text-muted-foreground">Laporan terperinci untuk analisis bisnis</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="gap-1.5 py-1.5 pl-3 pr-3.5 text-sm">
            <Building2 className="size-3.5 text-muted-foreground" />
            {branch?.name || "Semua Cabang"}
          </Badge>
          <Button onClick={handleExport} disabled={!report} variant="outline">
            <Download className="mr-2 size-4" />
            Export CSV
          </Button>
        </div>
      </section>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filter Periode</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <label className="text-sm font-medium">Dari tanggal</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
          <div className="flex-1">
            <label className="text-sm font-medium">Sampai tanggal</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-end">
            <Button onClick={fetchReport} className="w-full">
              <Calendar className="mr-2 size-4" />
              Terapkan Filter
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && <Card className="border-destructive/40"><CardContent className="p-4 text-sm text-destructive">{error}</CardContent></Card>}

      {loading ? (
        <div className="flex min-h-[60vh] items-center justify-center">
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
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total Penjualan"
          value={rupiah(summary.totalSales)}
          trend={trend}
          icon={TrendingUp}
        />
        <MetricCard
          label="Total Profit"
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

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tren Penjualan Harian</CardTitle>
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
                  <th className="text-right py-2 font-semibold">Penjualan</th>
                  <th className="text-right py-2 font-semibold">Profit</th>
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
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

      <section className="grid gap-4 lg:grid-cols-2">
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
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

      <section className="grid gap-4 lg:grid-cols-2">
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
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

      <section className="grid gap-4 lg:grid-cols-2">
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
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Pelanggan" value={String(summary.totalCustomers)} icon={TrendingUp} />
        <MetricCard label="Pelanggan Baru" value={String(summary.newCustomers)} icon={TrendingUp} />
        <MetricCard label="Pelanggan Aktif" value={String(summary.activeCustomers)} icon={TrendingUp} />
        <MetricCard label="Total Pengeluaran" value={rupiah(summary.totalSpent)} icon={TrendingUp} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
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
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-bold">{value}</p>
          </div>
          <div className={`flex size-12 items-center justify-center rounded-lg ${trend === false ? "bg-red-100" : "bg-emerald-100"}`}>
            <Icon className={`size-6 ${trend === false ? "text-red-600" : "text-emerald-600"}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
