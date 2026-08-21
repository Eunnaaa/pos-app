-- Kedai-Ku: Storage security policies
-- Jalankan di Supabase SQL Editor (Dashboard > SQL Editor > New query).
-- Bucket "product-images" dibuat public. Policy ini memastikan:
--   * anon/authenticated boleh MEMBACA file (public URL)
--   * anon TIDAK boleh menulis/menghapus
--   * hanya service_role (server app) yang menulis, mengubah, dan menghapus

do $$
begin
  drop policy if exists "public_read_product_images" on storage.objects;
  create policy "public_read_product_images"
    on storage.objects for select
    to anon, authenticated
    using (bucket_id = 'product-images');

  drop policy if exists "service_write_product_images" on storage.objects;
  create policy "service_write_product_images"
    on storage.objects for insert
    to service_role
    with check (bucket_id = 'product-images');

  drop policy if exists "service_update_product_images" on storage.objects;
  create policy "service_update_product_images"
    on storage.objects for update
    to service_role
    using (bucket_id = 'product-images');

  drop policy if exists "service_delete_product_images" on storage.objects;
  create policy "service_delete_product_images"
    on storage.objects for delete
    to service_role
    using (bucket_id = 'product-images');
end $$;
