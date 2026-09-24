-- Kedai-Ku: Scheduled jobs via pg_cron
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

-- 3) Lepaskan reservasi stok online dan batalkan order yang melewati tenggat.
--    Kunci baris order agar job tidak berlomba dengan webhook pembayaran.
create or replace function public.expire_online_stock_reservations(batch_limit integer default 100)
returns integer language plpgsql as $$
declare
  order_row record;
  reservation_row record;
  expired_count integer := 0;
  changed_count integer;
begin
  for order_row in
    select so.id, so.organization_id, so.status
    from public.sales_orders so
    where (
      (so.status in ('pending', 'cancelled')
        and so.metadata->>'stockReservationVersion' = '1'
        and (so.metadata->>'reservationExpiresAt')::timestamptz <= now()
        and (so.status = 'pending' or exists (
          select 1 from public.stock_reservations sr
          where sr.reference_type = 'sales_order' and sr.reference_id = so.id and sr.status = 'active'
        )))
      or (so.status = 'pending' and so.channel in ('self_order', 'kiosk')
        and coalesce(so.metadata->>'stockReservationVersion', '') <> '1'
        and so.created_at < now() - interval '15 minutes')
    )
    order by so.created_at
    limit batch_limit
    for update of so skip locked
  loop
    for reservation_row in
      select sr.id, sr.warehouse_id, sr.variant_id, sr.quantity
      from public.stock_reservations sr
      where sr.organization_id = order_row.organization_id
        and sr.reference_type = 'sales_order'
        and sr.reference_id = order_row.id
        and sr.status = 'active'
      order by sr.variant_id
      for update
    loop
      update public.stock_balances
      set reserved = reserved - reservation_row.quantity,
          available = available + reservation_row.quantity,
          version = version + 1,
          updated_at = now()
      where organization_id = order_row.organization_id
        and warehouse_id = reservation_row.warehouse_id
        and variant_id = reservation_row.variant_id
        and reserved >= reservation_row.quantity;
      get diagnostics changed_count = row_count;
      if changed_count <> 1 then
        raise exception 'Stock reservation balance inconsistent for order %', order_row.id;
      end if;
      update public.stock_reservations
      set status = 'expired', updated_at = now()
      where id = reservation_row.id;
    end loop;
    if order_row.status = 'pending' then
      update public.sales_orders set status = 'cancelled', updated_at = now() where id = order_row.id;
    end if;
    expired_count := expired_count + 1;
  end loop;
  return expired_count;
end;
$$;
revoke all on function public.expire_online_stock_reservations(integer) from public;

select cron.unschedule('expire-self-order-pending') where exists (select 1 from cron.job where jobname = 'expire-self-order-pending');
select cron.unschedule('expire-online-stock-reservations') where exists (select 1 from cron.job where jobname = 'expire-online-stock-reservations');

select cron.schedule(
  'expire-online-stock-reservations',
  '* * * * *',
  $$ select public.expire_online_stock_reservations(100) $$
);
