-- Kasir-Ku: Scheduled jobs via pg_cron
-- Jalankan di Supabase SQL Editor. pg_cron aktif di Supabase secara default.

create extension if not exists pg_cron;

-- 1) Expire held orders langsung di database (setiap 5 menit).
--    Backup server-side: POST /api/v1/webhooks/cron dengan header `Authorization: Bearer <WEBHOOK_SECRET>`.
select cron.unschedule('expire-held-orders') where exists (select 1 from cron.job where jobname = 'expire-held-orders');

select cron.schedule(
  'expire-held-orders',
  '*/5 * * * *',
  $$ update public.held_orders
        set status = 'expired', updated_at = now()
        where status = 'held' and expires_at < now() $$
);

-- 2) Contoh auto-call endpoint aplikasi tiap hari pukul 23:05 (membutuhkan pg_net).
--    Endpoint menutup periode dan membersihkan held order.
-- create extension if not exists pg_net;
--
-- select cron.unschedule('daily-close') where exists (select 1 from cron.job where jobname = 'daily-close');
-- select cron.schedule(
--   'daily-close',
--   '5 23 * * *',
--   $$ select net.http_post(
--        url := 'https://APP_URL/api/v1/webhooks/cron',
--        headers := jsonb_build_object('content-type','application/json','authorization','Bearer <WEBHOOK_SECRET>')
--      ) $$
-- );
