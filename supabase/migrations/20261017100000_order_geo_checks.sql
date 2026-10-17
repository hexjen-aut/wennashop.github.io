-- Contrôle du pays des commandes (anti-fraude).
--
-- À l'ouverture du site, le pays est déduit de la connexion (adresse IP, côté
-- Vercel), sans question. Au paiement, l'acheteur peut autoriser son appareil
-- à donner sa position : elle est comparée au pays de livraison. Le résultat
-- est écrit ici par la fonction order-geo-check (clé de service), jamais par
-- le navigateur, et l'agent le voit dans la fiche du paiement.
--
-- risk : 'ok' ou 'a_verifier'. Une alerte ne bloque rien : l'agent décide.
-- La position est arrondie à 0,01° (~1 km) et effacée après 12 mois.

create table if not exists public.order_geo_checks (
  order_id         uuid primary key references public.orders(id) on delete cascade,
  user_id          uuid,
  delivery_country text,
  display_country  text,
  country_source   text check (country_source in ('auto', 'manual')),
  ip_country       text,
  device_status    text not null check (device_status in ('match', 'mismatch', 'denied', 'unavailable')),
  device_country   text,
  device_lat       numeric(6, 2),
  device_lng       numeric(6, 2),
  device_accuracy_m integer,
  risk             text not null check (risk in ('ok', 'a_verifier')),
  reasons          text[] not null default '{}',
  created_at       timestamptz not null default now()
);

alter table public.order_geo_checks enable row level security;

drop policy if exists order_geo_checks_staff_read on public.order_geo_checks;
create policy order_geo_checks_staff_read on public.order_geo_checks
  for select to authenticated using (public.is_payment_staff());

revoke all on public.order_geo_checks from anon, authenticated;
grant select on public.order_geo_checks to authenticated;

-- Fiche paiement de l'agent : contrôle du pays de la commande.
create or replace function public.order_geo_check(p_order_id uuid)
returns setof public.order_geo_checks
language sql stable security definer set search_path = public as $$
  select * from public.order_geo_checks
  where order_id = p_order_id and public.is_payment_staff();
$$;
revoke all on function public.order_geo_check(uuid) from public, anon;
grant execute on function public.order_geo_check(uuid) to authenticated;

-- Effacement de la position après 12 mois (le verdict reste).
create or replace function public.purge_order_geo_positions()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.order_geo_checks
     set device_lat = null, device_lng = null, device_accuracy_m = null
   where created_at < now() - interval '12 months' and device_lat is not null;
end $$;
revoke all on function public.purge_order_geo_positions() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge-order-geo-positions') then
    perform cron.unschedule('purge-order-geo-positions');
  end if;
  perform cron.schedule('purge-order-geo-positions', '17 3 * * *', 'select public.purge_order_geo_positions()');
end $$;
