-- Offre « Vendeurs fondateurs » : les 20 premières boutiques validées qui
-- publient un produit deviennent fondatrices. Elles gardent le badge pour
-- toujours et sont mises en avant 3 mois sur la boutique (bandeau
-- « Vendeurs fondateurs »), à compter de leur premier produit en ligne.
-- La commission ne change pas.
--
-- Le rang est attribué ici, jamais par le navigateur : shops_protect_badges
-- empêche un vendeur de le modifier. Les boutiques officielles et les
-- boutiques de démonstration ne prennent pas de place.

alter table public.shops
  add column if not exists founder_rank smallint unique,
  add column if not exists founder_at timestamptz;

create or replace function public.shops_protect_badges()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if coalesce(get_my_role(), '') = 'admin' or current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_official := false;
    new.is_verified := false;
    new.founder_rank := null;
    new.founder_at := null;
  else
    new.is_official := old.is_official;
    new.is_verified := old.is_verified;
    new.user_id := old.user_id;
    new.founder_rank := old.founder_rank;
    new.founder_at := old.founder_at;
  end if;
  return new;
end;
$$;

-- Places restantes, affichées sur /vendre (visiteurs non connectés compris).
create or replace function public.founder_places_left()
returns integer language sql stable security definer set search_path = public as $$
  select greatest(0, 20 - count(*))::integer from public.shops where founder_rank is not null;
$$;
revoke all on function public.founder_places_left() from public;
grant execute on function public.founder_places_left() to anon, authenticated;

-- Donne le statut de fondateur à une boutique si elle y a droit.
create or replace function public.try_grant_founder(p_shop_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_shop public.shops;
  v_rank integer;
begin
  -- Deux produits publiés en même temps ne doivent pas prendre la même place.
  perform pg_advisory_xact_lock(hashtext('wenna_founder_sellers'));
  select * into v_shop from public.shops where id = p_shop_id;
  if v_shop.id is null or v_shop.status <> 'active' or v_shop.founder_rank is not null
     or coalesce(v_shop.is_official, false)
     or v_shop.slug in ('acheteur-d-mo', 'chasseur-d-mo', 'vendeur-d-mo') then
    return;
  end if;
  if not exists (select 1 from public.products where shop_id = p_shop_id and status = 'active') then
    return;
  end if;
  if (select count(*) from public.shops where founder_rank is not null) >= 20 then
    return;
  end if;
  select coalesce(max(founder_rank), 0) + 1 into v_rank from public.shops;
  update public.shops set founder_rank = v_rank, founder_at = now() where id = p_shop_id;
  insert into public.notifications (user_id, type, title, body, link)
  values (
    v_shop.user_id, 'founder',
    'Tu es vendeur fondateur n° ' || v_rank,
    'Ta boutique fait partie des 20 premières de WennaShop : badge « Vendeur fondateur » à vie et mise en avant sur la boutique pendant 3 mois.',
    '/vendeur'
  );
end;
$$;
revoke all on function public.try_grant_founder(uuid) from public, anon, authenticated;

create or replace function public.trg_founder_on_product()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'active' and new.shop_id is not null
     and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    perform public.try_grant_founder(new.shop_id);
  end if;
  return new;
end;
$$;

create or replace function public.trg_founder_on_shop()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'active' and old.status is distinct from 'active' then
    perform public.try_grant_founder(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_products_founder on public.products;
create trigger trg_products_founder after insert or update of status on public.products
  for each row execute function public.trg_founder_on_product();

drop trigger if exists trg_shops_founder on public.shops;
create trigger trg_shops_founder after update of status on public.shops
  for each row execute function public.trg_founder_on_shop();
