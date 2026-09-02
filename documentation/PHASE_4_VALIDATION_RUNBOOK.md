# Fase 4 — PWA, Hardware, dan Critical Journey Runbook

Dokumen ini adalah prosedur verifikasi **staging terlebih dahulu**, lalu production. Jangan menyatakan GO-LIVE hanya dari test otomatis: instalasi PWA, printer fisik, email/WhatsApp, payment live, dan rekonsiliasi bisnis memerlukan bukti manual.

## 1. Persiapan dan bukti

- Gunakan organisasi uji terpisah dan satu cabang/gudang uji.
- Catat URL deployment, commit SHA, waktu mulai/selesai, browser/OS, model printer, koneksi (BLE/USB/LAN), serta ukuran kertas.
- Simpan screenshot/video setiap tahap dan ID order/PO/session yang dibuat.
- Jalankan quality gates lokal:

```bash
npm run typecheck
npm test
npm run build
npm run e2e
```

- Jalankan smoke terhadap staging tanpa menyalakan server lokal:

```bash
PLAYWRIGHT_BASE_URL=https://staging.example.com npm run e2e
```

Authenticated surface preflight membutuhkan storage state owner dari tenant staging yang sudah disiapkan:

```bash
CRITICAL_JOURNEY_SMOKE=true \
PLAYWRIGHT_BASE_URL=https://staging.example.com \
PLAYWRIGHT_STORAGE_STATE=.auth/staging-owner.json \
npm run e2e:critical
```

Preflight ini bersifat read-only dan memastikan seluruh permukaan golden path tidak redirect/error 5xx. Pembuatan dan mutasi data tetap mengikuti langkah manual bagian 5 agar tidak pernah merusak tenant production secara tidak sengaja.

- Untuk test service worker offline, target harus production build atau deployment HTTPS:

```bash
PWA_PRODUCTION_SMOKE=true PLAYWRIGHT_BASE_URL=https://staging.example.com \
  npx playwright test tests/e2e/pwa.spec.ts --project=chromium
```

## 2. Instalasi PWA

Uji minimal pada Chrome Android, Edge/Chrome desktop, dan Safari iOS. Service worker membutuhkan HTTPS (localhost dikecualikan oleh browser).

1. Buka aplikasi, login, lalu install melalui menu browser/Add to Home Screen.
2. Pastikan ikon normal dan maskable tidak terpotong, nama `Kedai-Ku` benar, dan aplikasi terbuka tanpa address bar.
3. Periksa DevTools → Application:
   - manifest `display: standalone`;
   - ikon PNG 192×192 dan 512×512 tersedia;
   - service worker aktif;
   - Cache Storage tidak berisi respons `/api/*` atau `/api/auth/*`.
4. Matikan jaringan dan buka halaman publik baru. Halaman “Anda sedang offline” harus muncul.

Catatan: Safari/iOS mendukung instalasi PWA, tetapi tidak mendukung Web Bluetooth. Untuk cetak BLE langsung gunakan Chrome/Edge pada Android, Windows, macOS, atau ChromeOS. Printer USB/LAN memerlukan bridge/driver vendor dan bukan jalur Web Bluetooth aplikasi ini.

## 3. Offline checkout dan replay

Arsitektur aktual: transaksi tersimpan di IndexedDB `kedai-ku-offline/mutations`, lalu direplay **berurutan ke endpoint asli** (contoh `/api/v1/pos/checkout`) dengan header `idempotency-key`. Endpoint `/api/v1/sync` adalah change-log generik dan **tidak** mengeksekusi checkout. Jangan mengharapkan request checkout menuju `/api/v1/sync` di Network panel.

1. Saat online, login sebagai kasir, pilih cabang/gudang, buka shift dengan Rp100.000, dan buka `/dashboard/pos`.
2. Pastikan katalog serta server quote sudah termuat sebelum memutus jaringan. Pembayaran online/QRIS tidak boleh diuji sebagai transaksi offline.
3. Aktifkan airplane mode. Buat dua transaksi cash berbeda. Keduanya harus menampilkan status tersimpan offline dan badge antrean bernilai 2.
4. Di DevTools → Application → IndexedDB, catat dua `id`, `idempotencyKey`, `organizationId`, dan `branchId` yang berbeda/benar.
5. Sambungkan jaringan. Badge antrean harus turun ke 0 dan hanya satu rangkaian replay berjalan meskipun page-level dan app-level listener menerima event `online` bersamaan.
6. Refresh POS dan laporan. Untuk setiap `idempotencyKey`, harus ada tepat satu order, satu set stock movement, satu receipt, dan jurnal yang seimbang.
7. Ulangi dengan throttling: putuskan jaringan persis setelah tombol Bayar ditekan, lalu reconnect. Ini memvalidasi kasus server berhasil tetapi respons hilang; hasil tetap satu order karena idempotency.
8. Logout/login sebelum reconnect untuk menguji session expiry. Item 401 tetap pending hingga session valid; jangan input transaksi tersebut secara manual sebelum memastikan status server.

Kriteria lulus: dua checkout menjadi dua order (bukan 0/1/3+), stok berkurang sesuai kuantitas tepat sekali, kas/ledger bertambah tepat sekali, dan dead-letter queue kosong.

## 4. Printer thermal ESC/POS

Gunakan satu printer 58 mm dan satu printer 80 mm. Matikan header/footer bawaan driver agar tidak mengubah layout.

1. Di POS pilih ukuran kertas `58 mm`, hubungkan “Printer BLE”, selesaikan transaksi, lalu cetak direct thermal.
2. Ulangi dengan ukuran `80 mm`.
3. Verifikasi secara visual:
   - nama toko/cabang, alamat, nomor order, kasir, tanggal;
   - nama/qty item panjang tidak menimpa harga;
   - diskon, subtotal, pajak, total, tender, dan kembalian;
   - QR/kode verifikasi dapat dipindai;
   - footer, feed, dan paper cut (jika printer memiliki cutter).
4. Cetak 10 struk berurutan untuk memastikan buffer BLE tidak terpotong.
5. Putuskan printer saat cetak dan pastikan UI memberi error tanpa menandai transaksi gagal.

Catat firmware dan UUID BLE jika koneksi gagal. Logo raster belum dikirim ke ESC/POS; DoD logo hanya dapat dinyatakan lulus setelah dukungan raster/logo ditambahkan atau printer dikonfigurasi dengan logo tersimpan.

## 5. Golden path staging

Jalankan berurutan agar setiap output menjadi input tahap berikutnya.

### A. Onboarding dan master data

- Register owner baru, buka link verifikasi, login, selesaikan organisasi/cabang/gudang.
- Buat 2 kategori, 3 produk beserta varian/harga modal/jual, dan stok awal.
- Buat supplier → PO → goods receipt. Bandingkan quantity received dengan kenaikan stock balance/movement.

### B. POS

- Buka shift Rp100.000.
- Cash: 2 item + diskon item; cocokkan total dan kembalian.
- Split payment: 50% cash + 50% metode yang memang didukung environment. Jika split QRIS ditolak UI, catat sebagai batasan produk—jangan menandai skenario lulus.
- Hold → transaksi lain → resume → bayar. Pastikan cart dan harga tidak tertukar.
- Tutup shift dengan actual cash; cocokkan expected, actual, variance, dan laporan shift.

### C. Self-order dan KDS

- Buat QR Meja 05, scan dari perangkat tanpa session/login, pesan pay-at-cashier lalu online.
- Pastikan order hanya masuk tenant/cabang/meja tersebut.
- KDS: `queued → cooking → ready → served`; verifikasi urutan timestamp dan realtime/polling setelah reload.

### D. CRM dan keuangan

- Buat/pilih customer ketika checkout dan cocokkan kenaikan poin dengan aturan loyalty.
- Catat operational expense/petty cash.
- Cocokkan dashboard, omzet, stock, cash movement, dan P&L dengan transaksi di A–C.

## 6. Rekonsiliasi dan keputusan GO-LIVE

Untuk setiap order uji, periksa bahwa debit total sama dengan credit total dan tidak ada stock movement duplikat. Gunakan UI report atau query read-only yang telah direview sesuai skema deployment; jangan menjalankan query koreksi selama smoke test.

GO-LIVE hanya jika:

- seluruh bukti di atas terlampir;
- tidak ada blocking bug dan semua mismatch sudah ditutup/retest;
- backup/PITR serta prosedur rollback sudah diuji;
- payment webhook live, notifikasi, Sentry, PWA, dan kedua printer fisik mendapat bukti PASS;
- owner bisnis menyetujui angka rekonsiliasi stok, kas, revenue, tax, dan P&L.

Status yang belum diuji secara eksternal harus ditulis `BLOCKED — membutuhkan <perangkat/credential/domain>`, bukan PASS.
