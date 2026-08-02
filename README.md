# Kasir-Ku

Kasir-Ku is a responsive, multi-tenant Point of Sale platform for Indonesian retail, food & beverage, and service businesses. It combines POS, inventory, purchasing, CRM, loyalty, promotions, kitchen/reservations, finance, employees, reporting, offline workflows, integrations, and AI insights.

## Stack

- Next.js 15 App Router, React 19, strict TypeScript
- Tailwind CSS 4, shadcn/Radix UI, Recharts, TanStack Table
- Better Auth: email/password, admin controls, 2FA, optional Google/Apple
- Drizzle ORM + PostgreSQL/Supabase; 76 domain tables
- REST API under `/api/v1`
- PWA service worker + IndexedDB offline mutation queue
- Optional Midtrans, Xendit, WhatsApp, Telegram, email, Supabase Storage, and OpenAI-compatible AI adapters

## Features

- KPI dashboard, sales trend, top products, activity, low-stock alerts
- Split-screen POS, barcode search, cart notes, hold, multi-payment, receipt
- Product/variant/bundle/composite, category, brand, unit, barcode, serial, expiry
- Stock ledger, reservation, adjustment, opname, warehouse transfer
- Purchase order, receipt, invoice, payment, purchase return
- Sales order, quotation, invoice, sales return, partial/full refund
- Customer CRM, membership, points, vouchers, referral, store credit
- Promotion engine foundations: percentage, fixed, BOGO, bundle, cashback, happy hour, flash sale, birthday
- Kitchen display, table reservation, waiting list
- Income/expense, accounts, cash register, cash flow/profit data model
- Employee, shift, attendance, commission
- Multi-branch and multi-warehouse tenancy with RBAC
- Reports and AI assistant/forecast/stock/fraud/segmentation data model
- PWA install, offline status/fallback, replay-safe mutation queue

## Quick start

### 1. Install

```bash
npm install
cp .env.example .env
```

Generate a secure auth secret:

```bash
openssl rand -base64 32
```

### 2. Configure Supabase PostgreSQL

Create a Supabase project. In `.env`, configure the **transaction pooler URL** for the app:

```env
DATABASE_URL=postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres
DATABASE_SSL=require
DB_POOL_MAX=10
BETTER_AUTH_SECRET=<at-least-32-random-characters>
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_BETTER_AUTH_URL=http://localhost:3000
TRUSTED_ORIGINS=http://localhost:3000
```

For migration tooling, the direct URL or session pooler is usually preferable when IPv6/direct connectivity is available. Temporarily set `DATABASE_URL` to that URL when running migration commands.

### 3. Apply migration and seed

```bash
npm run db:migrate
npm run db:seed
```

The seed command only verifies database connectivity. It intentionally inserts no business or demo data. Create the first owner through sign-up/onboarding, then enter products, stock, customers, and suppliers from the management UI.

### 4. Run

```bash
npm run dev
```

Open:

- Landing: http://localhost:3000
- Dashboard: http://localhost:3000/dashboard
- POS: http://localhost:3000/dashboard/pos
- Health check: http://localhost:3000/api/v1/health

The dashboard starts empty and displays only authenticated tenant data. Sign up, complete onboarding, then let management enter all business master data.

## Commands

```bash
npm run dev           # development server
npm run build         # production build
npm run start         # production server
npm run typecheck     # strict TypeScript check
npm run lint          # ESLint
npm test              # Node-native core tests via tsx
npm run db:generate   # generate Drizzle migration
npm run db:migrate    # apply migrations
npm run db:seed       # verify DB connection; inserts no demo data
npm run db:clear -- --yes # remove all records; keep schema/migrations
npm run db:studio     # Drizzle Studio
```

## Environment variables

Required:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL/Supabase connection string |
| `DATABASE_SSL` | `require` for Supabase; `disable` for local Docker |
| `BETTER_AUTH_SECRET` | Random secret, minimum 32 characters |
| `BETTER_AUTH_URL` | Server-side public application URL |
| `NEXT_PUBLIC_BETTER_AUTH_URL` | Browser auth URL |

Optional provider groups activate only when all credentials for that provider exist:

- Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- Apple: `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`
- Supabase services: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Midtrans: `MIDTRANS_SERVER_KEY`, `MIDTRANS_BASE_URL`
- Xendit: `XENDIT_SECRET_KEY`
- WhatsApp: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`
- Telegram: `TELEGRAM_BOT_TOKEN`
- Email: `EMAIL_API_URL`, `EMAIL_API_KEY`
- AI: `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`
- Webhooks: `WEBHOOK_SECRET`

Never expose service-role, payment, AI, or webhook secrets with a `NEXT_PUBLIC_` prefix.

## API

All tenant APIs require a Better Auth session and:

```http
x-organization-id: <organization UUID>
x-branch-id: <branch UUID> # when branch-scoped
```

State-changing transactional APIs also require:

```http
idempotency-key: <unique client key, 8-200 chars>
```

Representative endpoints:

| Endpoint | Purpose |
|---|---|
| `POST /api/v1/onboarding` | Create first organization/branch/warehouse |
| `GET /api/v1/dashboard` | Tenant dashboard metrics |
| `GET/POST /api/v1/resources/:resource` | Validated tenant CRUD/list |
| `GET/PATCH/DELETE /api/v1/resources/:resource/:id` | Validated item operations |
| `POST /api/v1/pos/checkout` | Atomic multi-payment checkout |
| `POST /api/v1/inventory/adjustments` | Stock adjustment ledger entry |
| `POST /api/v1/inventory/transfers` | Create stock transfer |
| `POST /api/v1/inventory/transfers/:id/ship` | Deduct source stock |
| `POST /api/v1/inventory/transfers/:id/receive` | Add destination stock |
| `POST /api/v1/purchases/receipts` | Receive PO and add stock |
| `POST /api/v1/sales/returns` | Return/refund and optional restock |
| `POST /api/v1/sync` | Replay-safe offline change ingestion |
| `POST /api/v1/ai/assistant` | Business analytics assistant |
| `POST /api/v1/integrations/payments` | Midtrans/Xendit payment request |
| `POST /api/v1/integrations/notifications` | WhatsApp/Telegram/email dispatch |

Responses use `{ "data": ..., "meta": ... }`; errors use `{ "error": { "code", "message", "details" }, "requestId" }`.

## RBAC

| Role | Primary permissions |
|---|---|
| Owner | Full organization access |
| Manager | Dashboard, POS, sales, inventory, purchasing, customers, suppliers, reports, employees |
| Cashier | Dashboard, POS, sales/return, customers |
| Warehouse | Inventory, purchasing, suppliers |
| Accountant | Dashboard, sales/purchase read, finance, reports |

Authorization is checked server-side. Hiding navigation does not grant or revoke access.

## Data and security conventions

- Tenant is resolved from authenticated membership; request headers are never trusted without membership validation.
- Money is stored as PostgreSQL `bigint` integer rupiah/minor units.
- Quantities and stock changes are posted through an append-only movement ledger plus current balances.
- Checkout, receiving, transfers, returns, and loyalty run inside DB transactions.
- Mutating workflows use idempotency records to prevent duplicated transactions.
- Better Auth uses secure production cookies, session rotation/freshness, rate limits, token encryption, and optional TOTP 2FA.
- Global CSP, HSTS in production, frame denial, nosniff, referrer, resource, opener, and permissions headers are configured.
- Webhook utilities use HMAC, expiry checks, constant-time comparison, and private-network URL rejection.

For Supabase defense-in-depth, enable RLS for any tables exposed through Supabase APIs. The application server uses PostgreSQL with server-side tenant filters and should use a database role limited to required tables.

## PWA and offline behavior

The production build registers `/sw.js`, caches only public shell/static assets, and never caches `/api/*` or private dashboard responses. Offline mutations are stored in IndexedDB with an idempotency key and replayed after connectivity returns. Keep the POS tab open during an outage; full cold-start private dashboard caching is intentionally disabled to avoid leaking tenant data on shared devices.

## Integrations and AI

Provider adapters are inactive unless configured. Missing credentials return explicit configuration errors. The AI assistant uses deterministic SQL analytics when no AI provider is configured; configured mode expects an OpenAI-compatible `/chat/completions` endpoint. OCR, provider settlement, WhatsApp template approval, and live payment webhook behavior still require vendor accounts and sandbox/production verification.

## Production checklist

1. Use a production Supabase project and restricted DB credentials.
2. Run `npm run db:migrate` in a controlled deploy step.
3. Set HTTPS URLs and a new `BETTER_AUTH_SECRET`.
4. Configure exact `TRUSTED_ORIGINS`.
5. Enable Google/Apple callback URLs only when used.
6. Configure payment webhook signatures and idempotency keys.
7. Set Supabase backups/PITR; test restore procedures.
8. Configure monitoring/log redaction and alerting.
9. Run `npm run typecheck && npm run lint && npm test && npm run build`.
10. Perform vendor sandbox tests before enabling live payments/messages/AI.

## Verification limitations

Automated checks validate schema generation, TypeScript, lint, unit behavior, and production compilation. Live Supabase migration/seed and third-party provider calls cannot be verified without the corresponding project credentials. Do not treat an adapter build as proof of vendor approval or successful production settlement.
