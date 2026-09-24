-- Trois notifications manquantes (email + site, via la table `notifications`
-- déjà branchée sur l'envoi d'email automatique) :
--   1. Vendeur : nouvelle commande reçue (n'existait pas du tout).
--   2. Acheteur : commande expédiée.
--   3. Vendeur : nouvel avis client.
-- Plus une quatrième greffée dans orders_hunter_earnings() existant :
--   4. Chasseur : une boutique qu'il a recrutée vient d'être activée
--      (3 commandes livrées).

-- 1. Nouvelle commande → vendeur. Trigger au niveau de l'instruction (pas
-- ligne par ligne) avec une table de transition, pour n'envoyer qu'UNE
-- notification par vendeur même si son panier contient plusieurs de ses
-- produits (insérés en une seule requête, voir CartContext.createOrder).
create or replace function public.notify_vendor_new_order()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into notifications (user_id, type, title, body, link)
  select distinct s.user_id, 'order', 'Nouvelle commande !',
    'Tu as reçu une nouvelle commande sur WennaShop.',
    '/vendeur'
  from new_items ni
  join shops s on s.id = ni.shop_id
  where s.user_id is not null;
  return null;
end;
$$;

create trigger trg_notify_vendor_new_order
after insert on public.order_items
referencing new table as new_items
for each statement
execute function public.notify_vendor_new_order();

-- 2. Commande expédiée → acheteur.
create or replace function public.notify_buyer_order_shipped()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = 'shipped' and old.status is distinct from 'shipped' then
    insert into notifications (user_id, type, title, body, link)
    values (
      new.user_id, 'order', 'Commande expédiée !',
      'Ta commande' || case when new.tracking_number is not null then ' (' || new.tracking_number || ')' else '' end || ' est en route.',
      '/suivi'
    );
  end if;
  return new;
end;
$$;

create trigger trg_notify_buyer_order_shipped
after update of status on public.orders
for each row
execute function public.notify_buyer_order_shipped();

-- 3. Nouvel avis → vendeur.
create or replace function public.notify_vendor_new_review()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_seller_id uuid;
  v_product_name text;
begin
  select p.seller_id, p.name into v_seller_id, v_product_name
  from products p where p.id = new.product_id;

  if v_seller_id is not null then
    insert into notifications (user_id, type, title, body, link)
    values (
      v_seller_id, 'review', 'Nouvel avis client',
      coalesce(new.reviewer_name, 'Un client') || ' a laissé un avis sur "' || coalesce(v_product_name, 'un de tes produits') || '".',
      '/produit?id=' || new.product_id
    );
  end if;
  return new;
end;
$$;

create trigger trg_notify_vendor_new_review
after insert on public.reviews
for each row
execute function public.notify_vendor_new_review();

-- 4. Boutique parrainée activée → chasseur (greffé dans la fonction
-- existante, juste après qu'elle marque la boutique comme activée).
create or replace function public.orders_hunter_earnings()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
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
      select distinct s.id as shop_id, s.name as shop_name, s.recruited_by
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

        insert into notifications (user_id, type, title, body, link)
        values (
          r.recruited_by, 'money', 'Boutique activée !',
          'La boutique "' || coalesce(r.shop_name, 'que tu as recrutée') || '" a atteint ' || v_need || ' commandes livrées — ta prime et tes commissions démarrent.',
          '/chasseur'
        );
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
$function$;
