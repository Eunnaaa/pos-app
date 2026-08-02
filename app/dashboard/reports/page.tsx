import Link from "next/link"
import { BarChart3, FileText, LineChart, PieChart, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function ReportsPage() {
  const reports = [
    {
      title: "Laporan Penjualan",
      description: "Analisis detail penjualan, produk terlaris, pelanggan, dan metode pembayaran",
      icon: TrendingUp,
      href: "/dashboard/reports/sales",
      color: "bg-emerald-100 text-emerald-600",
    },
    {
      title: "Laporan Persediaan",
      description: "Status stok, rotasi persediaan, nilai inventori, dan pergerakan stok",
      icon: BarChart3,
      href: "/dashboard/reports/inventory",
      color: "bg-blue-100 text-blue-600",
    },
    {
      title: "Laporan Pembelian",
      description: "Analisis PO, supplier, timeline penerimaan, dan status pembayaran",
      icon: LineChart,
      href: "/dashboard/reports/purchases",
      color: "bg-purple-100 text-purple-600",
    },
    {
      title: "Laporan Keuangan",
      description: "Pendapatan, pengeluaran, profit, arus kas, dan akun keuangan",
      icon: PieChart,
      href: "/dashboard/reports/finance",
      color: "bg-amber-100 text-amber-600",
    },
    {
      title: "Laporan Pelanggan",
      description: "Segmentasi pelanggan, lifetime value, loyalitas, dan pertumbuhan",
      icon: FileText,
      href: "/dashboard/reports/customers",
      color: "bg-rose-100 text-rose-600",
    },
  ]

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <section>
        <h1 className="text-3xl font-bold">Laporan Bisnis</h1>
        <p className="text-muted-foreground">Akses laporan terperinci untuk analisis mendalam setiap aspek bisnis</p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {reports.map((report) => (
          <Card key={report.href} className="flex flex-col hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg">{report.title}</CardTitle>
                  <CardDescription className="mt-1">{report.description}</CardDescription>
                </div>
                <div className={`flex size-10 items-center justify-center rounded-lg ${report.color}`}>
                  <report.icon className="size-5" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="mt-auto pt-0">
              <Button asChild className="w-full">
                <Link href={report.href}>Buka Laporan</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-emerald-200 bg-emerald-50">
        <CardHeader>
          <CardTitle className="text-base">Tips Penggunaan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>✓ Gunakan filter tanggal untuk melihat periode tertentu</p>
          <p>✓ Download laporan dalam format JSON untuk analisis lebih lanjut</p>
          <p>✓ Semua data laporan real-time dari basis data Anda</p>
          <p>✓ Akses terbatas sesuai peran dan izin Anda</p>
        </CardContent>
      </Card>
    </div>
  )
}
