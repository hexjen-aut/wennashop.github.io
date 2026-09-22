create table public.platform_goals (
  id uuid primary key default gen_random_uuid(),
  audience text not null check (audience in ('artisan','buyer','all')),
  metric text not null check (metric in ('revenue','orders_count','products_count','shop_completion','custom')),
  title text not null,
  description text,
  target_value numeric not null default 0,
  period text not null default 'monthly' check (period in ('monthly','all_time')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.platform_goals enable row level security;

create policy platform_goals_select on public.platform_goals for select using (true);
create policy platform_goals_insert_admin on public.platform_goals for insert with check (get_my_role() = 'admin');
create policy platform_goals_update_admin on public.platform_goals for update using (get_my_role() = 'admin');
create policy platform_goals_delete_admin on public.platform_goals for delete using (get_my_role() = 'admin');

alter table public.users add column if not exists onboarding_completed_at timestamptz;
