-- Transport au poids pour les quêtes.
--
-- À la publication, l'acheteur donne une quantité et une taille (tranche de
-- poids). Le transport est estimé sur le poids MAXIMUM de la tranche, pour ne
-- jamais être à court. Le chasseur saisit ensuite le poids réel dans sa
-- proposition et le transport est recalculé dessus.
--
-- Les montants sont calculés ici, en base, à partir des tarifs de l'admin
-- (site_config.shipping_rates) : ce que le navigateur envoie est ignoré.

alter table public.quests
  add column if not exists quantity int not null default 1,
  add column if not exists size_bracket text,
  add column if not exists destination_country text,
  add column if not exists est_weight_kg numeric,
  add column if not exists shipping_estimate numeric;

alter table public.quests
  add constraint quests_quantity_check check (quantity between 1 and 50),
  add constraint quests_size_bracket_check check (size_bracket in ('petit', 'moyen', 'gros', 'tres_gros'));

alter table public.quest_proposals
  add column if not exists weight_kg numeric,
  add column if not exists shipping_cost numeric;

alter table public.quest_proposals
  add constraint quest_proposals_weight_check check (weight_kg is null or (weight_kg > 0 and weight_kg <= 500));

-- Tarifs par trajet : [{from, to, rate_per_kg, currency, minimum}]
insert into public.site_config (key, value)
values ('shipping_rates', '[{"from":"Maroc","to":"Gabon","rate_per_kg":80,"currency":"MAD","minimum":80}]')
on conflict (key) do nothing;

-- Poids maximum d'une tranche (null = sur devis)
create or replace function public.quest_bracket_max_kg(p_bracket text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case p_bracket when 'petit' then 0.5 when 'moyen' then 2 when 'gros' then 5 end
$$;

-- Prix du transport d'un poids donné, dans la devise demandée (FCFA = XAF).
-- p_origin « Les deux » : on prend le trajet le plus cher entre Gabon et Maroc.
-- Retourne null si aucun tarif ne couvre le trajet (transport à confirmer).
create or replace function public.quest_shipping_quote(
  p_weight_kg numeric, p_origin text, p_destination text, p_currency text
)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rates jsonb;
  v_target text := case when upper(p_currency) = 'FCFA' then 'XAF' else upper(p_currency) end;
  v_origins text[];
  v_best numeric;
  v_cost numeric;
  r jsonb;
  fx record;
begin
  if p_weight_kg is null or p_weight_kg <= 0 or p_destination is null or p_origin is null then
    return null;
  end if;

  select value::jsonb into v_rates from public.site_config where key = 'shipping_rates';
  if v_rates is null or jsonb_typeof(v_rates) <> 'array' then return null; end if;

  v_origins := case when lower(p_origin) = 'les deux' then array['gabon', 'maroc'] else array[lower(p_origin)] end;

  for r in select * from jsonb_array_elements(v_rates) loop
    continue when lower(r->>'from') <> all (v_origins) or lower(r->>'to') <> lower(p_destination);
    continue when coalesce((r->>'rate_per_kg')::numeric, 0) <= 0;

    v_cost := ceil(greatest(p_weight_kg * (r->>'rate_per_kg')::numeric, coalesce((r->>'minimum')::numeric, 0)));

    if upper(r->>'currency') <> v_target then
      select rate, safety_margin_percent into fx
      from public.exchange_rates
      where base_currency = upper(r->>'currency') and quote_currency = v_target;
      continue when not found;
      -- même calcul que convertPrice (src/lib/currency.js) : marge de change incluse
      v_cost := ceil(v_cost * fx.rate * (1 + fx.safety_margin_percent / 100.0));
    end if;

    v_best := greatest(coalesce(v_best, 0), v_cost);
  end loop;

  return v_best;
end;
$$;

revoke all on function public.quest_shipping_quote(numeric, text, text, text) from public;
grant execute on function public.quest_shipping_quote(numeric, text, text, text) to anon, authenticated, service_role;

-- Quête : poids estimé (max de la tranche × quantité) et transport estimé
create or replace function public.quests_compute_shipping()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Les montants ne se modifient jamais directement : on garde l'ancien calcul
  -- tant que rien de ce qui le détermine n'a changé.
  if tg_op = 'UPDATE'
     and new.quantity is not distinct from old.quantity
     and new.size_bracket is not distinct from old.size_bracket
     and new.country_target is not distinct from old.country_target
     and new.destination_country is not distinct from old.destination_country
     and new.currency is not distinct from old.currency then
    new.est_weight_kg := old.est_weight_kg;
    new.shipping_estimate := old.shipping_estimate;
    return new;
  end if;

  new.est_weight_kg := public.quest_bracket_max_kg(new.size_bracket) * new.quantity;
  new.shipping_estimate := public.quest_shipping_quote(
    new.est_weight_kg, new.country_target, new.destination_country, new.currency
  );
  return new;
end;
$$;

create trigger quests_compute_shipping
  before insert or update
  on public.quests
  for each row execute function public.quests_compute_shipping();

-- Proposition : transport sur le poids réel, du pays du chasseur vers
-- l'acheteur (à défaut, depuis le pays de la quête). Poids figé une fois la
-- proposition retenue.
create or replace function public.quest_proposals_compute_shipping()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quest record;
  v_origin text;
begin
  if tg_op = 'UPDATE' then
    if new.weight_kg is not distinct from old.weight_kg then
      new.shipping_cost := old.shipping_cost;
      return new;
    end if;
    if old.status <> 'pending' then
      raise exception 'Le poids ne peut plus changer une fois la proposition retenue.' using errcode = '23514';
    end if;
  end if;

  select country_target, destination_country, currency into v_quest
  from public.quests where id = new.quest_id;

  select nullif(country, 'Autre') into v_origin from public.users where id = new.hunter_id;
  v_origin := coalesce(v_origin, v_quest.country_target);

  new.shipping_cost := public.quest_shipping_quote(
    new.weight_kg, v_origin, v_quest.destination_country, v_quest.currency
  );
  return new;
end;
$$;

create trigger quest_proposals_compute_shipping
  before insert or update of weight_kg, shipping_cost
  on public.quest_proposals
  for each row execute function public.quest_proposals_compute_shipping();
