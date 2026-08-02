import Link from "next/link"
import {
  ArrowRight,
  BarChart3,
  BrainCircuit,
  Check,
  Cloud,
  PackageCheck,
  ShieldCheck,
  ShoppingCart,
  Store,
  UsersRound,
  WifiOff,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ThemeToggle } from "@/components/theme-toggle"

const features = [
  [ShoppingCart, "POS super cepat", "Cari produk, scan barcode, split bill, multi-payment, dan receipt digital."],
  [PackageCheck, "Inventory real-time", "Stok cabang dan gudang selalu sinkron dengan histori movement lengkap."],
  [BarChart3, "Laporan bisnis", "Dashboard penjualan, profit, customer, dan performa karyawan dalam satu layar."],
  [UsersRound, "CRM & loyalty", "Membership, poin, voucher, referral, cashback, dan segmentasi pelanggan."],
  [WifiOff, "Tetap jalan offline", "Transaksi tersimpan aman saat internet putus dan otomatis tersinkron kembali."],
  [BrainCircuit, "AI analytics", "Forecast penjualan, stock planning, fraud detection, dan insight otomatis."],
] as const

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-background">
      <div className="absolute inset-x-0 top-0 -z-10 h-[680px] bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_38%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.10),transparent_32%)]" />
      <nav className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20"><Store className="size-5" /></span><span className="text-xl font-bold tracking-tight">Kasir-Ku</span></Link>
        <div className="flex items-center gap-2"><ThemeToggle /><Button variant="ghost" asChild><Link href="/sign-in">Masuk</Link></Button><Button className="bg-emerald-600 hover:bg-emerald-700" asChild><Link href="/sign-up">Mulai gratis</Link></Button></div>
      </nav>

      <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"><Cloud className="size-4" /> POS cloud modern untuk bisnis Indonesia</div>
          <h1 className="max-w-3xl text-4xl font-black leading-[1.08] tracking-tight sm:text-6xl">Kelola bisnis lebih mudah. <span className="text-emerald-600">Jualan lebih cepat.</span></h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">Kasir-Ku menyatukan kasir, inventory, pembelian, pelanggan, keuangan, laporan, dan AI analytics—siap untuk satu hingga ratusan cabang.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row"><Button size="lg" className="h-12 bg-emerald-600 px-7 text-base hover:bg-emerald-700" asChild><Link href="/sign-up">Coba gratis sekarang <ArrowRight /></Link></Button><Button size="lg" variant="outline" className="h-12 px-7 text-base" asChild><Link href="/dashboard">Lihat demo dashboard</Link></Button></div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">{["Tanpa kartu kredit", "Setup 5 menit", "Bantuan 24/7"].map((item) => <span key={item} className="flex items-center gap-1.5"><Check className="size-4 text-emerald-600" />{item}</span>)}</div>
        </div>
        <div className="relative">
          <div className="absolute -inset-8 -z-10 rounded-full bg-emerald-500/10 blur-3xl" />
          <Card className="overflow-hidden border-emerald-100 bg-card/90 shadow-2xl shadow-emerald-950/10 backdrop-blur dark:border-emerald-950">
            <div className="flex items-center gap-2 border-b px-5 py-3"><span className="size-2.5 rounded-full bg-red-400" /><span className="size-2.5 rounded-full bg-amber-400" /><span className="size-2.5 rounded-full bg-emerald-400" /><span className="ml-3 text-xs text-muted-foreground">app.kasir-ku.id/dashboard</span></div>
            <CardContent className="p-5">
              <div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Penjualan hari ini</p><p className="mt-1 text-3xl font-bold">Rp 0</p></div><span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">Belum ada data</span></div>
              <div className="mt-7 flex h-40 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">Grafik terisi setelah management memasukkan data dan terjadi transaksi.</div>
              <div className="mt-5 grid grid-cols-3 gap-3">{[["0", "Order"], ["0", "Customer"], ["Rp 0", "Profit"]].map(([value, label]) => <div key={label} className="rounded-xl bg-muted/70 p-3"><p className="font-bold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>)}</div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="border-y bg-muted/30"><div className="mx-auto max-w-7xl px-4 py-20 sm:px-6"><div className="mx-auto max-w-2xl text-center"><p className="text-sm font-semibold uppercase tracking-widest text-emerald-600">Semua dalam satu platform</p><h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Dibuat untuk bisnis yang ingin tumbuh</h2><p className="mt-4 text-muted-foreground">Dari warung hingga multi-cabang, fitur lengkap Kasir-Ku mengikuti kebutuhan bisnis Anda.</p></div><div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{features.map(([Icon, title, description]) => <Card key={title} className="border-border/70 shadow-sm transition hover:-translate-y-1 hover:shadow-md"><CardContent className="p-6"><span className="flex size-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><Icon className="size-5" /></span><h3 className="mt-5 text-lg font-bold">{title}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p></CardContent></Card>)}</div></div></section>

      <section className="mx-auto max-w-5xl px-4 py-20 text-center sm:px-6"><ShieldCheck className="mx-auto size-10 text-emerald-600" /><h2 className="mt-5 text-3xl font-bold">Siap membuat operasional lebih efisien?</h2><p className="mx-auto mt-3 max-w-xl text-muted-foreground">Mulai kelola bisnis dengan data yang rapi, keputusan yang cepat, dan pengalaman pelanggan yang lebih baik.</p><Button size="lg" className="mt-7 bg-emerald-600 hover:bg-emerald-700" asChild><Link href="/sign-up">Buat akun Kasir-Ku <ArrowRight /></Link></Button></section>
      <footer className="border-t"><div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6"><span>© 2026 Kasir-Ku. Semua hak dilindungi.</span><span>POS cerdas untuk bisnis Indonesia 🇮🇩</span></div></footer>
    </main>
  )
}
