-- Relances des vendeurs inscrits sans produit.
--
-- Une boutique active qui n'a encore aucun produit (ni en ligne, ni en attente
-- de validation) reçoit au plus 4 relances : J+1, J+3, J+7 et J+14 après sa
-- création. Chaque relance est une notification : le déclencheur existant
-- (send-notification-email) l'envoie aussi par e-mail.
-- - Une seule relance par passage, et pas deux à moins de 48 h d'écart.
-- - Pour une boutique ancienne, seule la relance la plus récente due part (pas
--   de rattrapage des précédentes).
-- - Les relances s'arrêtent dès le premier produit ajouté.
-- Passage quotidien à 8 h 43 UTC (9 h 43 au Maroc et au Gabon).

create table if not exists public.seller_nudges (
  shop_id uuid not null references public.shops(id) on delete cascade,
  step integer not null check (step in (1, 3, 7, 14)),
  sent_at timestamptz not null default now(),
  primary key (shop_id, step)
);
alter table public.seller_nudges enable row level security;
create policy seller_nudges_admin_select on public.seller_nudges for select using (public.get_my_role() = 'admin');

create or replace function public.run_seller_nudges()
returns integer language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_step integer;
  v_title text;
  v_body text;
  v_left integer := greatest(0, 20 - (select count(*) from public.shops where founder_rank is not null));
  v_sent integer := 0;
begin
  for r in
    select s.id as shop_id, s.user_id, s.name,
           floor(extract(epoch from now() - s.created_at) / 86400)::int as age_days
    from public.shops s
    join public.users u on u.id = s.user_id
    where s.status = 'active'
      and not coalesce(s.is_official, false)
      and s.slug not in ('acheteur-d-mo', 'chasseur-d-mo', 'vendeur-d-mo')
      and u.status = 'active'
      and u.role = 'artisan'
      and s.created_at > now() - interval '60 days'
      and not exists (select 1 from public.products p where p.shop_id = s.id and p.status in ('active', 'pending'))
      and not exists (select 1 from public.seller_nudges n where n.shop_id = s.id and n.sent_at > now() - interval '48 hours')
  loop
    v_step := case
      when r.age_days >= 14 then 14
      when r.age_days >= 7 then 7
      when r.age_days >= 3 then 3
      when r.age_days >= 1 then 1
    end;
    continue when v_step is null;
    continue when exists (select 1 from public.seller_nudges where shop_id = r.shop_id and step >= v_step);

    if v_step = 1 then
      v_title := 'Ta boutique est prête : publie ton premier produit';
      v_body := 'Il ne manque qu''un produit pour que les acheteurs te trouvent. Une photo, un prix, un stock : ça prend 2 minutes depuis ton espace vendeur.';
    elsif v_step = 3 then
      v_title := 'Besoin d''un coup de main pour ton premier produit ?';
      v_body := 'Dans ton espace vendeur, touche Wenna en bas de l''écran : elle t''explique tout, des photos aux variantes (tailles, couleurs, parfums). Tu peux aussi activer la vente en gros.';
    elsif v_step = 7 then
      if v_left > 0 then
        v_title := 'Plus que ' || v_left || ' places de vendeur fondateur';
        v_body := 'Les 20 premières boutiques qui mettent un produit en ligne gagnent le badge « Vendeur fondateur » à vie et 3 mois en vedette sur la page d''accueil. Publie ton premier produit pour prendre ta place.';
      else
        v_title := 'Les acheteurs attendent tes produits';
        v_body := 'Ta boutique est ouverte, mais sans produit elle n''apparaît pas dans la boutique. Publie ton premier produit depuis ton espace vendeur.';
      end if;
    else
      v_title := 'Ta boutique attend toujours son premier produit';
      v_body := 'Sans produit, ta boutique reste invisible pour les acheteurs. Une question ? Touche Wenna dans ton espace vendeur ou écris à l''équipe : on t''aide à démarrer.';
    end if;

    insert into public.seller_nudges (shop_id, step) values (r.shop_id, v_step);
    insert into public.notifications (user_id, type, title, body, link)
    values (r.user_id, 'seller_nudge', v_title, v_body, '/vendeur');
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end $$;

revoke all on function public.run_seller_nudges() from public, anon, authenticated;

select cron.schedule('seller-nudges-daily', '43 8 * * *', 'select public.run_seller_nudges()');
