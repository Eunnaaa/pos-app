import Link from "next/link"
import { Store } from "lucide-react"
import { legalProseStyles } from "@/lib/legal-content"

export const metadata = { title: "Syarat Layanan", description: "Syarat dan ketentuan layanan Kasir-Ku." }

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-background">
      <nav className="mx-auto flex h-20 max-w-4xl items-center px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-emerald-600 text-white"><Store className="size-5" /></span><span className="text-xl font-bold tracking-tight">Kasir-Ku</span></Link>
      </nav>
      <article className="mx-auto max-w-4xl px-4 pb-20 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight">Syarat Layanan</h1>
        <p className="mt-2 text-sm text-muted-foreground">Terakhir diperbarui: 1 Januari 2026</p>
        <div className={legalProseStyles} dangerouslySetInnerHTML={{ __html: termsContent }} />
      </article>
    </main>
  )
}

const termsContent = `
<h2>1. Penerimaan Syarat</h2>
<p>Dengan mendaftar, mengakses, atau menggunakan platform Kasir-Ku ("Layanan"), Anda menyetujui untuk terikat oleh Syarat Layanan ini ("Ketentuan"). Jika Anda tidak menyetujui Ketentuan ini, mohon untuk tidak menggunakan Layanan.</p>

<h2>2. Definisi</h2>
<p>"Kasir-Ku", "kami", atau "penyedia" merujuk pada penyelenggara platform Kasir-Ku. "Pengguna" atau "Anda" merujuk pada individu atau badan usaha yang mendaftar dan menggunakan Layanan. "Konten" merujuk pada data, informasi, dan materi yang Anda unggah ke Layanan.</p>

<h2>3. Akun dan Tanggung Jawab</h2>
<p>Anda bertanggung jawab menjaga kerahasiaan kredensial akun Anda dan untuk semua aktivitas yang terjadi di bawah akun Anda. Anda setuju untuk memberikan informasi yang akurat dan terkini saat pendaftaran. Anda harus berusia minimal 17 tahun atau telah mendapat persetujuan dari pihak yang berwenang untuk menggunakan Layanan atas nama badan usaha.</p>

<h2>4. Penggunaan Layanan yang Dilarang</h2>
<p>Anda setuju untuk tidak: (a) menggunakan Layanan untuk tujuan ilegal atau tidak sah; (b) mencoba mengakses data pengguna lain tanpa otorisasi; (c) mengganggu atau merusak infrastruktur Layanan; (d) melakukan rekayasa balik atau mendekompilasi Layanan; atau (e) menggunakan Layanan untuk memproses transaksi yang melanggar hukum Indonesia.</p>

<h2>5. Langganan dan Pembayaran</h2>
<p>Layanan tersedia dalam paket gratis dan berbayar. Biaya langganan ditampilkan di situs kami dan dapat berubah sewaktu-waktu dengan pemberitahuan terlebih dahulu. Pembayaran dilakukan secara di muka untuk setiap periode langganan. Tidak ada pengembalian dana untuk periode yang sudah dibayar, kecuali diwajibkan oleh hukum yang berlaku.</p>

<h2>6. Data dan Privasi</h2>
<p>Pengumpulan, penggunaan, dan perlindungan data pribadi diatur dalam <a href="/privacy">Kebijakan Privasi</a> kami, yang merupakan bagian tak terpisahkan dari Ketentuan ini. Kami memproses data pribadi sesuai dengan UU No. 27 Tahun 2022 tentang Perlindungan Data Pribami (UU PDP).</p>

<h2>7. Hak Kekayaan Intelektual</h2>
<p>Kami memegang semua hak atas kode, desain, merek dagang, dan elemen Layanan. Anda mempertahankan kepemilikan atas Konten yang Anda unggah. Dengan mengunggah Konten, Anda memberi kami lisensi terbatas untuk memproses Konten tersebut semata-miga untuk menyediakan Layanan kepada Anda.</p>

<h2>8. Pembatasan Tanggung Jawab</h2>
<p>Layanan disediakan "sebagaimana adanya" tanpa jaminan apa pun. Sejauh diizinkan oleh hukum, kami tidak bertanggung jawab atas kerugian tidak langsung, insidental, atau konsekuensial yang timbul dari penggunaan Layanan. Tanggung jawab kami terbatas pada jumlah yang Anda bayarkan dalam 12 bulan terakhir.</p>

<h2>9. Pengakhiran</h2>
<p>Anda dapat menghentikan akun Anda kapan saja. Kami dapat menangguhkan atau mengakhiri akun Anda jika Anda melanggar Ketentuan ini. Setelah pengakhiran, data Anda akan dihapus dalam jangka waktu yang wajar, kecuali diwajibkan oleh hukum untuk menyimpannya.</p>

<h2>10. Hukum yang Berlaku</h2>
<p>Ketentuan ini diatur oleh hukum Republik Indonesia. Setiap sengketa akan diselesaikan melalui musyawarah, dan apabila tidak tercapai, akan diselesaikan melalui pengadilan yang berwenang di wilayah Republik Indonesia.</p>

<h2>11. Perubahan Ketentuan</h2>
<p>Kami dapat mengubah Ketentuan ini sewaktu-waktu. Perubahan akan diberitahukan melalui email atau pemberitahuan dalam aplikasi. Penggunaan Layanan setelah perubahan berlaku merupakan persetujuan Anda terhadap Ketentuan yang diperbarui.</p>

<h2>12. Kontak</h2>
<p>Untuk pertanyaan terkait Ketentuan ini, silakan hubungi kami di <a href="mailto:support@kasir-ku.id">support@kasir-ku.id</a>.</p>
`
