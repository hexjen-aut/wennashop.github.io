-- Bucket des images choisies par l'admin (carrousel de la page d'accueil).
-- Public en lecture (les images s'affichent sur le site), écriture réservée
-- à l'admin. Images uniquement, 5 Mo maximum.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-assets', 'site-assets', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy site_assets_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'site-assets' and public.get_my_role() = 'admin');

create policy site_assets_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'site-assets' and public.get_my_role() = 'admin');

create policy site_assets_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'site-assets' and public.get_my_role() = 'admin');
