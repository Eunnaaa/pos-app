"use client"

import { useState } from "react"
import { ArrowRight, Check, ShieldCheck, Sparkles, X, Zap } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Link } from "@/i18n/navigation"

function formatRupiah(amount: number): string {
  return `Rp${amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`
}

export function PricingSection() {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly")

  return (
    <section id="harga" className="py-20 bg-muted/20 border-b scroll-mt-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {/* Section Header */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-emerald-600">
            Pilihan Paket Fleksibel
          </p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl text-foreground">
            Investasi Terjangkau untuk Bisnis Anda
          </h2>
          <p className="mt-4 text-muted-foreground text-base">
            Mulai gratis dengan Starter, atau upgrade ke Pro untuk menikmati transaksi tanpa batas, kelola resep bahan baku, dan laporan otomatis.
          </p>

          {/* Billing Switcher */}
          <div className="mt-8 inline-flex items-center gap-2 bg-background p-1.5 rounded-2xl border border-border/80 shadow-xs">
            <button
              type="button"
              onClick={() => setBillingCycle("monthly")}
              className={`px-5 py-2 text-sm font-semibold rounded-xl transition-all ${
                billingCycle === "monthly"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Tagihan Bulanan
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle("yearly")}
              className={`flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-xl transition-all ${
                billingCycle === "yearly"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>Tagihan Tahunan</span>
              <span
                className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                  billingCycle === "yearly"
                    ? "bg-white text-emerald-700"
                    : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                }`}
              >
                Hemat 20%
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className="mt-14 grid gap-8 lg:grid-cols-3 items-stretch">
          {/* 1. Starter (Free Tier) */}
          <div className="flex flex-col justify-between rounded-xl border border-border/80 bg-card p-6 shadow-sm hover:shadow-md transition-all duration-200">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Starter</span>
                <Badge variant="outline" className="text-xs font-semibold">Gratis</Badge>
              </div>
              <h3 className="text-2xl font-bold mt-2">Free</h3>
              <p className="text-xs text-muted-foreground mt-1 min-h-[32px]">
                Cocok untuk UMKM pemula, booth, dan usaha mandiri dengan 1 kasir.
              </p>

              <div className="my-6 min-h-[80px] flex flex-col justify-center">
                <div>
                  <span className="text-4xl font-extrabold text-foreground">Rp0</span>
                  <span className="text-xs text-muted-foreground"> / bulan</span>
                </div>
                <p className="text-[11px] text-muted-foreground/60 mt-1">Tanpa biaya berlangganan</p>
              </div>

              <div className="space-y-4 text-xs pt-4 mt-2">
                <p className="font-bold text-foreground mb-3">Kapasitas & Batasan:</p>
                <ul className="space-y-2.5">
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-emerald-600 shrink-0" />
                    <span>Maks. <strong>100 transaksi</strong> / bulan</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-emerald-600 shrink-0" />
                    <span>Maks. <strong>20 produk</strong> katalog</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-emerald-600 shrink-0" />
                    <span><strong>1 Cabang</strong> & <strong>1 Akun</strong> (Owner/Kasir)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-emerald-600 shrink-0" />
                    <span>Riwayat transaksi <strong>3 hari</strong></span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-emerald-600 shrink-0" />
                    <span>POS Kasir & Tutup Shift Standar</span>
                  </li>
                </ul>

                <p className="font-bold text-muted-foreground pt-2">Fitur Tambahan:</p>
                <ul className="space-y-2.5">
                  <li className="flex items-center gap-2 text-muted-foreground line-through">
                    <X className="size-4 text-muted-foreground/50 shrink-0" />
                    <span>Self Order QR Meja & Menu Digital</span>
                  </li>
                  <li className="flex items-center gap-2 text-muted-foreground line-through">
                    <X className="size-4 text-muted-foreground/50 shrink-0" />
                    <span>Resep Bahan Baku (BOM) & HPP</span>
                  </li>
                  <li className="flex items-center gap-2 text-muted-foreground line-through">
                    <X className="size-4 text-muted-foreground/50 shrink-0" />
                    <span>Export Laporan Excel & PDF</span>
                  </li>
                  <li className="flex items-center gap-2 text-muted-foreground line-through">
                    <X className="size-4 text-muted-foreground/50 shrink-0" />
                    <span>Rekap Shift via WhatsApp Owner</span>
                  </li>
                  <li className="flex items-center gap-2 text-muted-foreground line-through">
                    <X className="size-4 text-muted-foreground/50 shrink-0" />
                    <span>AI Business Insights & Prediksi</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="pt-6 mt-6">
              <Button variant="outline" size="lg" className="w-full font-semibold h-11" asChild>
                <Link href="/sign-up">
                  Mulai Gratis Sekarang
                </Link>
              </Button>
            </div>
          </div>

          {/* 2. Kedai-Ku Pro */}
          <div className="flex flex-col justify-between rounded-xl border-2 border-emerald-600 dark:border-emerald-500 bg-card p-6 shadow-xl shadow-emerald-600/10 transition-all duration-200">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Pro</span>
                <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-xs font-semibold">14 Hari Trial</Badge>
              </div>
              <h3 className="text-2xl font-bold mt-2">Kedai-Ku Pro</h3>
              <p className="text-xs text-muted-foreground mt-1 min-h-[32px]">
                Untuk kafe, kedai kopi, dan resto yang butuh stok detail & tim kasir.
              </p>

              <div className="my-6 min-h-[80px] flex flex-col justify-center">
                <div>
                  <span className="text-4xl font-extrabold text-foreground">
                    {billingCycle === "yearly" ? formatRupiah(79000) : formatRupiah(99000)}
                  </span>
                  <span className="text-xs text-muted-foreground"> / bulan</span>
                </div>
                {billingCycle === "yearly" ? (
                  <p className="text-[11px] text-emerald-600 font-semibold mt-1">Ditagih tahunan (hemat 20%)</p>
                ) : (
                  <p className="text-[11px] text-muted-foreground/60 mt-1">Ditagih per bulan</p>
                )}
              </div>

              <div className="space-y-4 text-xs pt-4 mt-2">
                <p className="font-bold text-foreground mb-3">Kapasitas & Batasan:</p>
                <ul className="space-y-2.5">
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-emerald-600 shrink-0 font-bold" />
                    <span><strong>Unlimited</strong> transaksi bulanan</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-emerald-600 shrink-0" />
                    <span><strong>Unlimited</strong> katalog produk & varian</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-emerald-600 shrink-0" />
                    <span><strong>Unlimited</strong> akun staf kasir</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-emerald-600 shrink-0" />
                    <span>Riwayat transaksi <strong>1 tahun (365 hari)</strong></span>
                  </li>
                </ul>

                <p className="font-bold text-emerald-700 dark:text-emerald-400 pt-2">Fitur Unggulan Pro:</p>
                <ul className="space-y-2.5">
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-emerald-600 shrink-0" />
                    <span><strong>Self Order QR Meja</strong> & Menu Digital</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-emerald-600 shrink-0" />
                    <span><strong>Resep Bahan Baku (BOM)</strong> & HPP Otomatis</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-emerald-600 shrink-0" />
                    <span><strong>Export Laporan</strong> Excel, CSV & PDF</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-emerald-600 shrink-0" />
                    <span><strong>Rekap Shift Otomatis</strong> ke WhatsApp Owner</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-emerald-600 shrink-0" />
                    <span><strong>AI Business Advisor</strong> & Analisis Laba</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-emerald-600 shrink-0" />
                    <span>Voucher Promo & Diskon Bertingkat</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="pt-6 mt-6">
              <Button size="lg" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-11 shadow-md shadow-emerald-600/25" asChild>
                <Link href="/sign-up">
                  Coba Gratis 14 Hari <ArrowRight className="ml-1.5 size-4" />
                </Link>
              </Button>
            </div>
          </div>

          {/* 3. Kedai-Ku Business */}
          <div className="flex flex-col justify-between rounded-xl border border-border/80 bg-card p-6 shadow-sm hover:shadow-md transition-all duration-200">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Enterprise</span>
                <Badge variant="outline" className="text-xs font-semibold">Multi-Cabang</Badge>
              </div>
              <h3 className="text-2xl font-bold mt-2">Kedai-Ku Business</h3>
              <p className="text-xs text-muted-foreground mt-1 min-h-[32px]">
                Untuk bisnis dengan banyak cabang, franchise & gudang sentral.
              </p>

              <div className="my-6 min-h-[80px] flex flex-col justify-center">
                <div>
                  <span className="text-4xl font-extrabold text-foreground">
                    {billingCycle === "yearly" ? formatRupiah(199000) : formatRupiah(249000)}
                  </span>
                  <span className="text-xs text-muted-foreground"> / bulan</span>
                </div>
                {billingCycle === "yearly" ? (
                  <p className="text-[11px] text-emerald-600 font-semibold mt-1">Ditagih tahunan (hemat 20%)</p>
                ) : (
                  <p className="text-[11px] text-muted-foreground/60 mt-1">Ditagih per bulan</p>
                )}
              </div>

              <div className="space-y-4 text-xs pt-4 mt-2">
                <p className="font-bold text-foreground mb-3">Semua Fitur Pro Ditambah:</p>
                <ul className="space-y-2.5">
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-emerald-600 shrink-0 font-bold" />
                    <span>Hingga <strong>5 Cabang Outlet</strong></span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-emerald-600 shrink-0 font-bold" />
                    <span>Hingga <strong>10 Gudang</strong> & Sentral Kitchen</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-emerald-600 shrink-0" />
                    <span><strong>Transfer Stok</strong> Antar Cabang</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-emerald-600 shrink-0" />
                    <span><strong>Laporan Konsolidasi</strong> Multi-Outlet</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-emerald-600 shrink-0" />
                    <span>Riwayat transaksi <strong>Selamanya</strong></span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-emerald-600 shrink-0" />
                    <span>Dukungan Teknis Prioritas 24/7</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="pt-6 mt-6">
              <Button variant="outline" size="lg" className="w-full font-semibold h-11 bg-muted/40 hover:bg-muted" asChild>
                <Link href="/sign-up">
                  Pilih Business
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Value Trust Badges */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-8 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-emerald-600" /> Tanpa kontrak terikat, batalkan kapan saja
          </span>
          <span className="flex items-center gap-2">
            <Zap className="size-4 text-emerald-600" /> Pembayaran instan via QRIS & Virtual Account
          </span>
          <span className="flex items-center gap-2">
            <Sparkles className="size-4 text-emerald-600" /> Coba Pro 14 hari tanpa kartu kredit
          </span>
        </div>
      </div>
    </section>
  )
}
