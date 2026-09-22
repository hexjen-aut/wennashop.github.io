alter table public.users drop constraint users_status_check;
alter table public.users add constraint users_status_check check (status = any (array['active','inactive','pending','pending_deletion','deleted','banned','rejected']));
