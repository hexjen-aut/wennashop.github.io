create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  label text not null,
  first_name text,
  last_name text,
  line1 text not null,
  line2 text,
  city text not null,
  postal_code text,
  country text not null default 'Maroc',
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.addresses enable row level security;

create policy addresses_select_own on public.addresses for select
  using (user_id in (select users.id from users where users.auth_id = auth.uid()));

create policy addresses_insert_own on public.addresses for insert
  with check (user_id in (select users.id from users where users.auth_id = auth.uid()));

create policy addresses_update_own on public.addresses for update
  using (user_id in (select users.id from users where users.auth_id = auth.uid()));

create policy addresses_delete_own on public.addresses for delete
  using (user_id in (select users.id from users where users.auth_id = auth.uid()));
