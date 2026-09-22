create table public.carriers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null,
  scope text not null default 'local' check (scope in ('local', 'international')),
  phone text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.carriers enable row level security;

create policy "Public read carriers" on public.carriers for select using (true);
create policy carriers_insert_admin on public.carriers for insert with check (get_my_role() = 'admin');
create policy carriers_update_admin on public.carriers for update using (get_my_role() = 'admin');
create policy carriers_delete_admin on public.carriers for delete using (get_my_role() = 'admin');

alter table public.shops
  add column has_carrier boolean,
  add column carrier_id uuid references public.carriers(id) on delete set null;
