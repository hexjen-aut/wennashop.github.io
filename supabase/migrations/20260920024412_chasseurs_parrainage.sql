-- =====================================================================
-- WennaShop — Chasseurs : recrutement de vendeurs (parrainage)
-- =====================================================================

-- 1. Paramètres ---------------------------------------------------------
insert into public.site_config (key, value, updated_at) values
  ('hunter_activation_bonus',    '3000', now()),
  ('hunter_activation_currency', 'XAF',  now()),
  ('hunter_activation_orders',   '3',    now()),
  ('hunter_revshare_pct',        '20',   now()),
  ('hunter_revshare_months',     '6',    now()),
  ('hunter_hold_days',           '7',    now()),
  ('hunter_claim_window_days',   '7',    now())
on conflict (key) do nothing;

create or replace function public.cfg_num(p_key text, p_default numeric)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select nullif(value, '')::numeric from site_config where key = p_key),
    p_default
  );
$$;

-- 2. Code de parrainage du chasseur (généré à la vérification KYC) ------
alter table public.users
  add column if not exists hunter_referral_code text unique;

create or replace function public.users_set_hunter_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.hunter_status = 'verified' and new.hunter_referral_code is null then
    loop
      new.hunter_referral_code := 'WS-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));
      exit when not exists (
        select 1 from users where hunter_referral_code = new.hunter_referral_code
      );
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_users_hunter_code on public.users;
create trigger trg_users_hunter_code
  before insert or update of hunter_status on public.users
  for each row execute function public.users_set_hunter_code();

update public.users
set hunter_status = hunter_status
where hunter_status = 'verified' and hunter_referral_code is null;

-- 3. Rattachement boutique -> chasseur ----------------------------------
alter table public.shops
  add column if not exists recruited_by uuid references public.users(id) on delete set null,
  add column if not exists recruited_at timestamptz,
  add column if not exists activated_at timestamptz;

create index if not exists idx_shops_recruited_by on public.shops(recruited_by);

create or replace function public.shops_protect_referral()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('wenna.referral_write', true), '') = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.recruited_by := null;
    new.recruited_at := null;
    new.activated_at := null;
  elsif new.recruited_by is distinct from old.recruited_by
     or new.recruited_at is distinct from old.recruited_at
     or new.activated_at is distinct from old.activated_at then
    raise exception 'Champs de parrainage non modifiables directement';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_shops_protect_referral on public.shops;
create trigger trg_shops_protect_referral
  before insert or update on public.shops
  for each row execute function public.shops_protect_referral();

-- 4. Gains des chasseurs ------------------------------------------------
create table if not exists public.hunter_earnings (
  id            uuid primary key default gen_random_uuid(),
  hunter_id     uuid not null references public.users(id) on delete cascade,
  shop_id       uuid not null references public.shops(id) on delete cascade,
  order_id      uuid references public.orders(id) on delete set null,
  order_item_id uuid references public.order_items(id) on delete set null,
  type          text not null check (type in ('activation_bonus', 'revenue_share')),
  base_amount   numeric(12,2) not null default 0,
  amount        numeric(12,2) not null check (amount >= 0),
  currency      text not null default 'XAF',
  status        text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  available_at  timestamptz not null,
  payout_id     uuid references public.payouts(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists uq_hunter_earnings_item
  on public.hunter_earnings(order_item_id, type);
create unique index if not exists uq_hunter_activation_once
  on public.hunter_earnings(shop_id) where type = 'activation_bonus';
create index if not exists idx_hunter_earnings_hunter
  on public.hunter_earnings(hunter_id, status);

alter table public.hunter_earnings enable row level security;

drop policy if exists hunter_earnings_own_read on public.hunter_earnings;
create policy hunter_earnings_own_read on public.hunter_earnings
  for select
  using (hunter_id in (select id from public.users where auth_id = auth.uid()));

create or replace view public.hunter_balances
with (security_invoker = true) as
select
  hunter_id,
  currency,
  coalesce(sum(amount) filter (where status = 'pending' and available_at >  now()), 0) as en_attente,
  coalesce(sum(amount) filter (where status = 'pending' and available_at <= now()), 0) as disponible,
  coalesce(sum(amount) filter (where status = 'paid'), 0)                              as verse
from public.hunter_earnings
group by hunter_id, currency;

-- 5. RPC : le vendeur saisit le code du chasseur ------------------------
create or replace function public.claim_hunter_referral(p_shop_id uuid, p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me     uuid;
  v_shop   shops%rowtype;
  v_hunter users%rowtype;
  v_window int := cfg_num('hunter_claim_window_days', 7)::int;
begin
  select id into v_me from users where auth_id = auth.uid();
  if v_me is null then raise exception 'non_authentifie'; end if;

  select * into v_shop from shops where id = p_shop_id;
  if not found or v_shop.user_id <> v_me then raise exception 'boutique_introuvable'; end if;
  if v_shop.recruited_by is not null then raise exception 'deja_parraine'; end if;
  if v_shop.created_at < now() - make_interval(days => v_window) then
    raise exception 'delai_depasse';
  end if;

  select * into v_hunter
  from users
  where hunter_referral_code = upper(trim(p_code))
    and hunter_status = 'verified';
  if not found then raise exception 'code_invalide'; end if;

  if v_hunter.id = v_me
     or (v_hunter.phone is not null
         and v_hunter.phone = (select phone from users where id = v_me)) then
    raise exception 'auto_parrainage_interdit';
  end if;

  perform set_config('wenna.referral_write', 'on', true);
  update shops set recruited_by = v_hunter.id, recruited_at = now() where id = p_shop_id;

  return json_build_object(
    'ok', true,
    'hunter', coalesce(v_hunter.first_name, v_hunter.full_name)
  );
end;
$$;

revoke all on function public.claim_hunter_referral(uuid, text) from public, anon;
grant execute on function public.claim_hunter_referral(uuid, text) to authenticated;

-- 6. Calcul automatique des gains au changement de statut de commande --
create or replace function public.orders_hunter_earnings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r           record;
  v_pct       numeric := cfg_num('hunter_revshare_pct', 20);
  v_months    int     := cfg_num('hunter_revshare_months', 6)::int;
  v_hold      int     := cfg_num('hunter_hold_days', 7)::int;
  v_need      int     := cfg_num('hunter_activation_orders', 3)::int;
  v_bonus     numeric := cfg_num('hunter_activation_bonus', 3000);
  v_bonus_cur text    := coalesce(
                           (select value from site_config where key = 'hunter_activation_currency'),
                           'XAF');
  v_count     int;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'delivered' then

    for r in
      select oi.id as item_id, oi.shop_id, oi.commission_amount,
             s.recruited_by, s.recruited_at
      from order_items oi
      join shops s on s.id = oi.shop_id
      join users h on h.id = s.recruited_by and h.hunter_status = 'verified'
      where oi.order_id = new.id
        and oi.commission_amount > 0
    loop
      if now() < r.recruited_at + make_interval(months => v_months) then
        insert into hunter_earnings
          (hunter_id, shop_id, order_id, order_item_id, type,
           base_amount, amount, currency, available_at)
        values
          (r.recruited_by, r.shop_id, new.id, r.item_id, 'revenue_share',
           r.commission_amount, round(r.commission_amount * v_pct / 100, 2),
           coalesce(new.currency, 'XAF'), now() + make_interval(days => v_hold))
        on conflict do nothing;
      end if;
    end loop;

    for r in
      select distinct s.id as shop_id, s.recruited_by
      from order_items oi
      join shops s on s.id = oi.shop_id
      join users h on h.id = s.recruited_by and h.hunter_status = 'verified'
      where oi.order_id = new.id
        and s.activated_at is null
    loop
      select count(distinct o.id) into v_count
      from orders o
      join order_items oi on oi.order_id = o.id
      where oi.shop_id = r.shop_id
        and o.status = 'delivered';

      if v_count >= v_need then
        perform set_config('wenna.referral_write', 'on', true);
        update shops set activated_at = now() where id = r.shop_id;

        insert into hunter_earnings
          (hunter_id, shop_id, order_id, type, base_amount, amount, currency, available_at)
        values
          (r.recruited_by, r.shop_id, new.id, 'activation_bonus', 0,
           v_bonus, v_bonus_cur, now() + make_interval(days => v_hold))
        on conflict do nothing;
      end if;
    end loop;

  elsif new.status in ('cancelled', 'returned') then
    update hunter_earnings
    set status = 'cancelled', updated_at = now()
    where order_id = new.id
      and type = 'revenue_share'
      and status = 'pending';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orders_hunter_earnings on public.orders;
create trigger trg_orders_hunter_earnings
  after update of status on public.orders
  for each row execute function public.orders_hunter_earnings();
