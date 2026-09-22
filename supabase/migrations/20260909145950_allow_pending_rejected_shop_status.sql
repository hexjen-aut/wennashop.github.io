alter table public.shops drop constraint shops_status_check;
alter table public.shops add constraint shops_status_check check (status = any (array['active','inactive','suspended','pending','rejected']));
