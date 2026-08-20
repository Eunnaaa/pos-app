"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronDown, Mail, MessageCircle, Store } from "lucide-react"

const faqs = [
  {
    q: "Apa itu Kasir-Ku dan untuk siapa?",
    a: "Kasir-Ku adalah platform Point of Sale (POS) berbasis cloud yang dirancang untuk bisnis Indonesia — retail, kuliner (F&B), dan jasa. Cocok untuk warung, minimarket, cafe, restoran, barbershop, salon, laundry, hingga multi-cabang.",
  },
  {
    q: "Bagaimana cara mendaftar?",
    a: "Klik 'Mulai gratis' di halaman utama, isi nama, email bisnis, dan kata sandi (minimal 12 karakter). Anda akan menerima email verifikasi — klik tautan di email untuk mengaktifkan akun, lalu login untuk mulai onboarding bisnis Anda.",
  },
  {
    q: "Apakah Kasir-Ku bisa digunakan offline?",
    a: "Ya. Kasir-Ku adalah PWA (Progressive Web App) dengan dukungan offline. Saat internet terputus, transaksi kasir tetap bisa dilakukan dan tersimpan aman di perangkat. Setelah koneksi kembali, transaksi otomatis tersinkron ke server dengan perlindungan idempotency (tidak ada transaksi ganda).",
  },
  {
    q: "Apakah data bisnis saya aman?",
    a: "Ya. Kami menggunakan enkripsi HTTPS/TLS, kontrol akses berbasis peran (RBAC), audit log, dan pemisahan data antar tenant. Setiap organisasi memiliki data terpisah. Detail lengkap ada di Kebijakan Privasi kami yang sesuai dengan UU No. 27/2022 (UU PDP).",
  },
  {
    q: "Metode pembayaran apa yang didukung?",
    a: "Kasir-Ku mendukung tunai (cash), kartu debit/kredit, QRIS, e-wallet, transfer bank, pay later, dan store credit. Pembayaran dapat dikombinasikan (multi-payment) dalam satu transaksi. Integrasi Midtrans dan Xendit tersedia untuk pembayaran online otomatis.",
  },
  {
    q: "Bisakah saya mengelola multiple cabang?",
    a: "Ya. Kasir-Ku mendukung multi-cabang dan multi-gudang dengan stok terpisah per cabang, transfer antar gudang, dan laporan terkonsolidasi. Setiap cabang bisa memiliki kasir dan gudang sendiri. Owner dapat mengelola semua cabang, kasir hanya melihat cabang yang ditugaskan.",
  },
  {
    q: "Apakah ada biaya bulanan?",
    a: "Kasir-Ku tersedia dengan paket gratis untuk mulai. Untuk fitur lanjutan dan multi-cabang, tersedia paket berbayar. Detail harga akan ditampilkan saat Anda siap upgrade. Tidak ada biaya tersembunyi — Anda hanya membayar sesuai paket yang dipilih.",
  },
  {
    q: "Bagaimana cara mengatur produk dan stok?",
    a: "Setelah onboarding, buka menu 'Produk' di dashboard untuk menambah produk, varian, barcode, dan harga. Stok awal dapat diatur saat membuat produk atau melalui menu 'Inventory' → Adjustment. Anda juga bisa import produk massal via CSV.",
  },
  {
    q: "Apakah Kasir-Ku mendukung pajak (PPN)?",
    a: "Ya. Anda dapat mengatur tarif pajak per produk (inklusif atau eksklusif). Sistem otomatis menghitung pajak per item saat checkout dan menampilkannya di struk. Laporan keuangan juga mencakung rincian pajak.",
  },
  {
    q: "Apakah ada program loyalitas pelanggan?",
    a: "Ya. Kasir-Ku memiliki sistem loyalitas lengkap: membership level, poin reward (1 poin per Rp 10.000), voucher, referral, dan store credit. Pelanggan otomatis mendapat poin saat bertransaksi dan dapat menukarnya untuk diskon.",
  },
  {
    q: "Bagaimana cara mencetak struk?",
    a: "Struk digital tersedia dengan QR verifikasi. Anda dapat mengirim struk via WhatsApp atau email kepada pelanggan. Untuk cetak fisik, gunakan fitur print browser (Ctrl+P) atau hubungkan printer thermal yang kompatibel dengan browser.",
  },
  {
    q: "Apakah data saya bisa di-export?",
    a: "Ya. Produk dapat di-export ke CSV/JSON. Laporan penjualan, keuangan, inventory, pelanggan, dan pembelian dapat di-export ke CSV. Data Anda adalah milik Anda dan dapat di-export kapan saja.",
  },
  {
    q: "Bagaimana jika saya lupa kata sandi?",
    a: "Klik 'Lupa kata sandi?' di halaman login. Anda akan menerima email dengan tautan reset. Klik tautan dan buat kata sandi baru. Untuk keamanan, semua sesi aktif akan dihapus saat kata sandi direset.",
  },
  {
    q: "Apakah ada batasan jumlah produk atau transaksi?",
    a: "Paket gratis memiliki batasan wajar untuk bisnis kecil. Paket berbayar mendukung volume lebih besar. Sistem dirancang untuk menangani ratusan cabang dan ribuan transaksi per hari dengan performa optimal.",
  },
  {
    q: "Bagaimana cara menghubungi support?",
    a: "Email support@kasir-ku.id untuk bantuan umum, atau dpo@kasir-ku.id untuk pertanyaan terkait data pribadi. Tim kami siap membantu di jam kerja (Senin-Jumat, 09:00-17:00 WIB).",
  },
]

export default function FaqPage() {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <main className="min-h-screen bg-background">
      <nav className="mx-auto flex h-20 max-w-4xl items-center px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-emerald-600 text-white"><Store className="size-5" /></span><span className="text-xl font-bold tracking-tight">Kasir-Ku</span></Link>
      </nav>
      <article className="mx-auto max-w-4xl px-4 pb-20 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight">Pusat Bantuan</h1>
        <p className="mt-2 text-sm text-muted-foreground">Pertanyaan yang sering diajukan tentang Kasir-Ku</p>

        <div className="mt-8 space-y-3">
          {faqs.map((faq, index) => (
            <div key={index} className="rounded-xl border bg-card">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-4 p-4 text-left"
                onClick={() => setOpen(open === index ? null : index)}
              >
                <span className="font-medium">{faq.q}</span>
                <ChevronDown className={`size-5 shrink-0 text-muted-foreground transition-transform ${open === index ? "rotate-180" : ""}`} />
              </button>
              {open === index && <div className="border-t px-4 py-3 text-sm leading-relaxed text-muted-foreground">{faq.a}</div>}
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-xl border bg-emerald-50 p-6 dark:bg-emerald-950/50">
          <h2 className="text-lg font-semibold">Masih butuh bantuan?</h2>
          <p className="mt-1 text-sm text-muted-foreground">Tim support kami siap membantu Anda.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a href="mailto:support@kasir-ku.id" className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm font-medium hover:bg-muted"><Mail className="size-4 text-emerald-600" /> support@kasir-ku.id</a>
            <a href="https://wa.me/6280000000000" className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm font-medium hover:bg-muted"><MessageCircle className="size-4 text-emerald-600" /> WhatsApp Support</a>
          </div>
        </div>

        <div className="mt-8 flex justify-center gap-4 text-sm text-muted-foreground">
          <Link href="/terms" className="hover:text-foreground hover:underline">Syarat Layanan</Link>
          <Link href="/privacy" className="hover:text-foreground hover:underline">Kebijakan Privasi</Link>
          <Link href="/" className="hover:text-foreground hover:underline">Kembali ke Beranda</Link>
        </div>
      </article>
    </main>
  )
}
