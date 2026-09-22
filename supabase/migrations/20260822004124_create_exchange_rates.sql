create table if not exists public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  base_currency text not null,
  quote_currency text not null,
  rate numeric not null check (rate > 0),
  safety_margin_percent numeric not null default 4 check (safety_margin_percent >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id),
  unique (base_currency, quote_currency)
);

alter table public.exchange_rates enable row level security;

drop policy if exists "exchange_rates_public_read" on public.exchange_rates;
create policy "exchange_rates_public_read"
  on public.exchange_rates for select
  using (true);

drop policy if exists "exchange_rates_admin_write" on public.exchange_rates;
create policy "exchange_rates_admin_write"
  on public.exchange_rates for all
  using (exists (select 1 from public.users u where u.auth_id = auth.uid() and u.role = 'admin'))
  with check (exists (select 1 from public.users u where u.auth_id = auth.uid() and u.role = 'admin'));

insert into public.exchange_rates (base_currency, quote_currency, rate, safety_margin_percent) values
  ('MAD', 'XOF', 65, 4),
  ('MAD', 'XAF', 65, 4),
  ('XOF', 'MAD', 0.0154, 4),
  ('XAF', 'MAD', 0.0154, 4),
  ('MAD', 'TND', 0.31, 4),
  ('TND', 'MAD', 3.2, 4)
on conflict (base_currency, quote_currency) do nothing;

create or replace function public.touch_exchange_rate()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_touch_exchange_rate on public.exchange_rates;
create trigger trg_touch_exchange_rate
  before update on public.exchange_rates
  for each row execute function public.touch_exchange_rate();
