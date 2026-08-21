import Link from "next/link"
import { Store } from "lucide-react"
import { legalProseStyles } from "@/lib/legal-content"

export const metadata = { title: "Kebijakan Privasi", description: "Kebijakan privasi dan perlindungan data pribadi Kedai-Ku." }

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background">
      <nav className="mx-auto flex h-20 max-w-4xl items-center px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-emerald-600 text-white"><Store className="size-5" /></span><span className="text-xl font-bold tracking-tight">Kedai-Ku</span></Link>
      </nav>
      <article className="mx-auto max-w-4xl px-4 pb-20 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight">Kebijakan Privasi</h1>
        <p className="mt-2 text-sm text-muted-foreground">Terakhir diperbarui: 1 Januari 2026</p>
        <div className={legalProseStyles} dangerouslySetInnerHTML={{ __html: privacyContent }} />
      </article>
    </main>
  )
}

const privacyContent = `
<p>Kebijakan Privasi ini menjelaskan bagaimana Kedai-Ku ("kami") mengumpulkan, menggunakan, menyimpan, dan melindungi data pribadi Anda ("Subjek Data") sesuai dengan <strong>UU No. 27 Tahun 2022 tentang Perlindungan Data Pribadi (UU PDP)</strong>.</p>

<h2>1. Data Pribadi yang Kami Kumpulkan</h2>
<p>Kami mengumpulkan data pribadi berikut:</p>
<ul>
<li><strong>Data identitas:</strong> nama, alamat email, nomor telepon, dan nama bisnis yang Anda berikan saat pendaftaran.</li>
<li><strong>Data transaksi:</strong> catatan penjualan, pembelian, stok, pelanggan, dan keuangan yang Anda input ke dalam sistem.</li>
<li><strong>Data teknis:</strong> alamat IP, jenis perangkat, browser, dan log aktivitas untuk keamanan dan peningkatan layanan.</li>
<li><strong>Data pembayaran:</strong> diproses melalui penyedia pembayaran pihak ketiga (Midtrans, Xendit). Kami tidak menyimpan data kartu kredit Anda.</li>
</ul>

<h2>2. Dasar Hukum Pemrosesan</h2>
<p>Sesuai Pasal 20 UU PDP, kami memproses data pribadi Anda berdasarkan: (a) persetujuan yang Anda berikan; (b) pelaksanaan kontrak (penyediaan Layanan); (c) kepatuhan terhadap kewajiban hukum; dan (d) kepentingan sah kami untuk menjaga keamanan dan meningkatkan Layanan.</p>

<h2>3. Tujuan Pemrosesan Data</h2>
<p>Data pribadi Anda diproses untuk: (a) menyediakan dan memelihara akun serta Layanan; (b) memproses transaksi penjualan dan pembayaran; (c) mengirim notifikasi, struk, dan laporan; (d) mencegah penipuan dan aktivitas mencurigakan; (e) memenuhi kewajiban hukum dan perpajakan.</p>

<h2>4. Berbagi Data dengan Pihak Ketiga</h2>
<p>Kami tidak menjual data pribadi Anda. Kami membagikan data terbatas kepada: (a) penyedia pembayaran (Midtrans, Xendit) untuk memproses transaksi; (b) penyedia notifikasi (WhatsApp, Telegram, email) untuk mengirim struk dan laporan; (c) penyedia cloud (Supabase) untuk penyimpanan data; dan (d) otoritas hukum apabila diwajibkan oleh hukum yang berlaku.</p>

<h2>5. Penyimpanan dan Keamanan Data</h2>
<p>Data disimpan di server yang berlokasi di Indonesia atau wilayah yang menyediakan tingkat perlindungan yang setara. Kami menerapkan: enkripsi data saat transit (HTTPS/TLS) dan saat penyimpanan; kontrol akses berbasis peran (RBAC); audit log; serta pemisahan data antar tenant. Data disimpan selama akun Anda aktif, dan setelah itu dihapus dalam jangka waktu yang wajar kecuali diwajibkan oleh hukum untuk menyimpannya.</p>

<h2>6. Hak Subjek Data</h2>
<p>Sesuai Bab V UU PDP, Anda memiliki hak untuk: (a) mengakses dan memperoleh salinan data pribadi Anda; (b) meminta perbaikan data yang tidak akurat; (c) meminta penghapusan data pribadi ("hak untuk dilupakan"); (d) menarik persetujuan pemrosesan; (e) mengajukan keberatan atas pemrosesan tertentu; (f) memperoleh portabilitas data. Untuk menggunakan hak ini, hubungi <a href="mailto:garyhardiansyah02@gmail.com">garyhardiansyah02@gmail.com</a>.</p>

<h2>7. Transfer Data Lintas Wilayah</h2>
<p>Apabila data pribadi dipindahkan ke luar wilayah Indonesia, kami memastikan negara tujuan memiliki perlindungan data yang setara atau telah memperoleh persetujuan Anda sesuai Pasal 56 UU PDP.</p>

<h2>8. Cookie dan Teknologi Pelacakan</h2>
<p>Kami menggunakan cookie esensial untuk menjaga sesi login dan preferensi aplikasi. Kami tidak menggunakan cookie pelacakan pihak ketiga untuk iklan. Lihat banner persetujuan cookie untuk mengelola preferensi Anda.</p>

<h2>9. Anak di Bawah Umur</h2>
<p>Layanan tidak ditujukan untuk individu di bawah usia 17 tahun. Kami tidak dengan sengaja mengumpulkan data pribadi anak-anak. Jika Anda yakin kami mengumpulkan data dari anak di bawah umur, hubungi kami untuk penghapusan.</p>

<h2>10. Pejabat Pelindungan Data (DPO)</h2>
<p>Untuk pertanyaan terkait perlindungan data, hak Anda, atau pengajuan keberatan, silakan hubungi Pejabat Pelindungan Data kami di <a href="mailto:garyhardiansyah02@gmail.com">garyhardiansyah02@gmail.com</a>.</p>

<h2>11. Perubahan Kebijakan</h2>
<p>Kebijakan ini dapat diperbarui sewaktu-waktu. Perubahan signifikan akan diberitahukan melalui email atau pemberitahuan dalam aplikasi paling lambat 14 hari sebelum berlaku.</p>

<h2>12. Kontak</h2>
<p>Untuk pertanyaan lainnya atau bantuan langsung, hubungi tim kami via WhatsApp di <a href="https://wa.me/6285353111025">+62 853-5311-1025</a> atau email <a href="mailto:garyhardiansyah02@gmail.com">garyhardiansyah02@gmail.com</a>.</p>
`
