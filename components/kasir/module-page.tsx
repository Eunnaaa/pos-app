"use client"

import {
  BrainCircuit,
  Building2,
  CalendarCheck,
  ChefHat,
  FileBarChart,
  PackagePlus,
  Percent,
  Settings,
  ShoppingBag,
  Truck,
  UserRoundCog,
  UsersRound,
  Warehouse,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { FoundationModulePage } from "./foundation-module-page"

type ModuleConfig = { title: string; description: string; icon: typeof PackagePlus; guidance: string }

const configs: Record<string, ModuleConfig> = {
  products: { title: "Manajemen Produk", description: "Kelola produk, varian, harga, dan barcode.", icon: PackagePlus, guidance: "Masukkan produk melalui menu Produk." },
  inventory: { title: "Inventory & Stok", description: "Pantau saldo dan movement stok.", icon: Warehouse, guidance: "Stok akan muncul setelah produk dan adjustment dibuat." },
  sales: { title: "Transaksi Penjualan", description: "Order, pembayaran, return, dan refund.", icon: ShoppingBag, guidance: "Transaksi akan muncul setelah checkout dari POS." },
  purchases: { title: "Pembelian", description: "Purchase order dan penerimaan barang.", icon: Truck, guidance: "Buat supplier dan produk sebelum membuat purchase order." },
  suppliers: { title: "Supplier", description: "Kelola data pemasok.", icon: Truck, guidance: "Masukkan supplier melalui menu Supplier." },
  customers: { title: "Customer CRM", description: "Kelola pelanggan dan histori belanja.", icon: UsersRound, guidance: "Masukkan customer melalui menu Customer." },
  loyalty: { title: "Loyalty & Membership", description: "Poin, membership, dan voucher.", icon: UsersRound, guidance: "Belum ada program loyalty. Konfigurasi modul ini setelah data customer tersedia." },
  promotions: { title: "Promosi", description: "Diskon, bundling, dan promo terjadwal.", icon: Percent, guidance: "Belum ada promosi. Data promosi harus dibuat oleh management." },
  kitchen: { title: "Kitchen Display", description: "Antrean pesanan dapur.", icon: ChefHat, guidance: "Belum ada antrean dapur. Order F&B akan tampil setelah diproses dari POS." },
  reservations: { title: "Reservasi", description: "Booking meja dan waiting list.", icon: CalendarCheck, guidance: "Belum ada reservasi. Data harus dimasukkan oleh management." },
  employees: { title: "Karyawan", description: "Karyawan, shift, dan attendance.", icon: UserRoundCog, guidance: "Belum ada data karyawan. Data harus dimasukkan oleh management." },
  branches: { title: "Cabang & Gudang", description: "Lokasi operasional organisasi.", icon: Building2, guidance: "Cabang utama dibuat saat onboarding. Pengelolaan lanjutan belum tersedia pada MVP." },
  reports: { title: "Laporan Bisnis", description: "Laporan berdasarkan data transaksi aktual.", icon: FileBarChart, guidance: "Laporan akan tersedia setelah ada transaksi." },
  ai: { title: "AI Insights", description: "Insight berdasarkan data bisnis aktual.", icon: BrainCircuit, guidance: "Insight akan tersedia setelah data transaksi cukup." },
  settings: { title: "Pengaturan", description: "Konfigurasi toko dan aplikasi.", icon: Settings, guidance: "Belum ada pengaturan tambahan." },
}

export function ModulePage({ module }: { module: string }) {
  if (["loyalty", "promotions", "kitchen", "reservations", "employees"].includes(module)) return <FoundationModulePage module={module} />
  const config = configs[module] || configs.settings
  const Icon = config.icon
  return <div className="flex flex-1 flex-col gap-5 p-4 md:p-6"><div className="flex items-start gap-3"><span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><Icon className="size-5" /></span><div><h2 className="text-2xl font-bold tracking-tight">{config.title}</h2><p className="text-sm text-muted-foreground">{config.description}</p></div></div><Card><CardContent className="flex min-h-[420px] flex-col items-center justify-center p-8 text-center"><span className="flex size-16 items-center justify-center rounded-2xl bg-muted"><Icon className="size-8 text-muted-foreground" /></span><h3 className="mt-5 text-lg font-semibold">Belum ada data</h3><p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{config.guidance}</p></CardContent></Card></div>
}
