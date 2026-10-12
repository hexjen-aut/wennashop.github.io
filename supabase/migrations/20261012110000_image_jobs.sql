-- Photos produits sur fond blanc : réglage admin + journal des détourages
-- automatiques (fonction remove-background, Photoroom), qui sert de quota
-- journalier par vendeur.

insert into public.site_config (key, value)
values ('product_white_bg_required', 'true')
on conflict (key) do nothing;

create table if not exists public.image_jobs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null,
  created_at timestamptz not null default now()
);

create index if not exists image_jobs_user_created on public.image_jobs (user_id, created_at desc);

-- Écriture réservée à la fonction (service_role) ; chacun ne voit que ses lignes.
alter table public.image_jobs enable row level security;

create policy image_jobs_select_own on public.image_jobs
  for select to authenticated
  using (user_id = (select public.my_user_id()) or public.get_my_role() = 'admin');
