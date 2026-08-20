import { Suspense } from "react"
import { Loader2 } from "lucide-react"
import { ReportPage } from "@/components/kasir/report-page"

export default function SalesReportPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="size-8 animate-spin text-emerald-600" /></div>}>
      <ReportPage reportType="sales" title="Laporan Penjualan" />
    </Suspense>
  )
}
