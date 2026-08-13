# Panduan Deployment — Kasir-Ku

Panduan lengkap untuk men-deploy Kasir-Ku ke produksi. Dua opsi hosting: **Vercel** (termudah) atau **Docker self-host** (kontrol penuh).

---

## Prasyarat (semua opsi)

1. **Supabase project produksi** — buat di [supabase.com](https://supabase.com)
   - Salin **transaction pooler URL** (`...pooler.supabase.com:6543/postgres`)
   - Salin **anon key** dan **service role key**
   - Enable Realtime replication: Database → Replication → enable pada `sales_orders`, `stock_balances`, `cash_register_sessions`
   - Run `supabase/storage-policies.sql` di SQL Editor (amankan bucket `product-images`)
   - Run `supabase/cron-jobs.sql` di SQL Editor (expire held orders setiap 5 menit)
   - Enable PITR / backups harian

2. **Secret acak** (minimal 32 karakter):
   ```bash
   openssl rand -base64 32  # BETTER_AUTH_SECRET
   openssl rand -base64 32  # WEBHOOK_SECRET
   ```

3. **Email provider** (untuk verifikasi email & receipt):
   - Daftar di Resend / SendGrid / provider lain
   - Dapatkan API URL + API key
   - Set `EMAIL_API_URL` dan `EMAIL_API_KEY`

4. **Payment gateway** (opsional, untuk QRIS/e-wallet):
   - Daftar Midtrans dan/atau Xendit
   - Selesaikan verifikasi sandbox → production
   - Set `MIDTRANS_SERVER_KEY` / `XENDIT_SECRET_KEY`
   - Konfigurasi webhook URL di dashboard Midtrans/Xendit → `/api/v1/integrations/payments/webhook`

---

## Opsi A: Vercel (Rekomendasi — termudah)

### Langkah 1: Push ke GitHub
```bash
git push origin main
```

### Langkah 2: Import ke Vercel
1. Buka [vercel.com/new](https://vercel.com/new)
2. Import repository GitHub Anda
3. Framework preset: **Next.js** (auto-detected)
4. Build command: `next build --turbopack` (sudah di package.json)
5. Output: standalone (sudah dikonfigurasi di `next.config.ts`)

### Langkah 3: Environment Variables
Di Vercel → Settings → Environment Variables, set:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `postgresql://postgres.REF:PASS@aws-0-REGION.pooler.supabase.com:6543/postgres` |
| `DATABASE_SSL` | `require` |
| `DB_POOL_MAX` | `10` |
| `BETTER_AUTH_SECRET` | (hasil openssl rand) |
| `BETTER_AUTH_URL` | `https://APP_ANDA.vercel.app` |
| `NEXT_PUBLIC_BETTER_AUTH_URL` | `https://APP_ANDA.vercel.app` |
| `TRUSTED_ORIGINS` | `https://APP_ANDA.vercel.app` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://REF.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (anon key) |
| `SUPABASE_URL` | `https://REF.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | (service role key) |
| `WEBHOOK_SECRET` | (hasil openssl rand) |
| `EMAIL_API_URL` | (URL provider email) |
| `EMAIL_API_KEY` | (API key provider email) |
| `SENTRY_DSN` | (opsional, butuh `npm install @sentry/nextjs`) |

Setelah custom domain dikonfigurasi, update `BETTER_AUTH_URL`, `NEXT_PUBLIC_BETTER_AUTH_URL`, dan `TRUSTED_ORIGINS` ke domain final.

### Langkah 4: Run Migration
Migration harus di-run dari local dengan direct/session pooler URL:
```bash
# Temporary: set DATABASE_URL ke direct pooler untuk migration
DATABASE_URL=postgresql://postgres.REF:PASS@aws-0-REGION.pooler.supabase.com:5432/postgres npm run db:migrate
```

### Langkah 5: Deploy
Vercel auto-deploy pada setiap push ke `main`. Verifikasi:
- [ ] Landing page: `https://APP.vercel.app`
- [ ] Health check: `https://APP.vercel.app/api/v1/health`
- [ ] Sign-up flow (dengan email verification)
- [ ] POS checkout (cash)
- [ ] Webhook Midtrans/Xendit (jika dikonfigurasi)

---

## Opsi B: Docker Self-Host (VPS / Cloud)

### Langkah 1: Build image
```bash
docker build -t kasir-ku .
```

### Langkah 2: Konfigurasi environment
Buat `.env.production`:
```env
NODE_ENV=production
DATABASE_URL=postgresql://postgres.REF:PASS@aws-0-REGION.pooler.supabase.com:6543/postgres
DATABASE_SSL=require
DB_POOL_MAX=10
BETTER_AUTH_SECRET=<32+ random chars>
BETTER_AUTH_URL=https://DOMAIN_ANDA.com
NEXT_PUBLIC_BETTER_AUTH_URL=https://DOMAIN_ANDA.com
TRUSTED_ORIGINS=https://DOMAIN_ANDA.com
# ... (sisanya sama dengan Vercel)
```

### Langkah 3: Run container
```bash
docker run -d \
  --name kasir-ku \
  --env-file .env.production \
  -p 3000:3000 \
  --restart unless-stopped \
  kasir-ku
```

### Langkah 4: Reverse proxy + SSL (nginx/Caddy)
Gunakan Caddy untuk auto-SSL:
```
domain-anda.com {
  reverse_proxy localhost:3000
}
```

Atau nginx + certbot untuk Let's Encrypt.

### Langkah 5: Run migration
```bash
docker exec kasir-ku node -e "import('./db/index.ts')"
# Atau dari local dengan direct pooler URL
```

---

## Checklist Produksi (sebelum go-live)

- [ ] **Database**: Supabase produksi, PITR backup aktif, storage policies + cron jobs di-run
- [ ] **Auth**: `BETTER_AUTH_SECRET` baru (32+ char), `TRUSTED_ORIGINS` = domain produksi, HTTPS only
- [ ] **Email**: Provider email terkonfigurasi, email verification aktif, test kirim email
- [ ] **Payments**: Midtrans/Xendit production (bukan sandbox), webhook URL dikonfigurasi, signature verified
- [ ] **Storage**: Bucket `product-images` dengan policy public-read/service-write
- [ ] **Realtime**: Replication enabled untuk live dashboard
- [ ] **Monitoring**: `SENTRY_DSN` set (butuh `npm install @sentry/nextjs`), `LOG_LEVEL=info`
- [ ] **Security headers**: Sudah dikonfigurasi di `next.config.ts` (CSP, HSTS, COOP, CORP)
- [ ] **Rate limiting**: Better Auth rate limits aktif + API middleware rate limiting
- [ ] **Webhooks**: `WEBHOOK_SECRET` set, Supabase DB webhook untuk auto-receipt dikonfigurasi
- [ ] **Quality gates**: `npm run typecheck && npm run lint && npm test && npm run build` semua lulus
- [ ] **Custom domain**: DNS pointing, SSL certificate, update semua URL env vars
- [ ] **OAuth**: Google/Apple callback URLs = domain produksi (jika digunakan)

---

## Post-Deploy Verification

1. **Smoke test flow kritis**:
   - Sign-up dengan email baru → terima email verifikasi → verifikasi → login
   - Onboarding (buat org/branch/warehouse)
   - Tambah produk + stock
   - Buka shift kasir → checkout cash → receipt → tutup shift
   - Cek dashboard (KPI muncul)
   - Cek laporan (sales/finance/inventory)

2. **Test online payment** (jika Midtrans/Xendit aktif):
   - Checkout dengan QRIS → scan → webhook settle → order status "paid"
   - Verifikasi ledger balanced (income credit = payment debit)

3. **Test offline mode**:
   - Putuskan internet → checkout → reconnect → auto-sync

4. **Monitor**:
   - Cek log (structured JSON) untuk error
   - Cek Sentry dashboard (jika aktif)
   - Cek Supabase dashboard untuk query performance

---

## Rollback

### Vercel
- Vercel → Deployments → pilih deployment sebelumnya → "Instant Rollback"

### Docker
```bash
docker stop kasir-ku
docker run -d --name kasir-ku --env-file .env.production -p 3000:3000 kasir-ku:PREVIOUS_TAG
```

### Database
- Supabase PITR: restore ke timestamp sebelum deploy
- **Penting**: selalu backup sebelum migration `npm run db:migrate`
