-- Variantes (coloris, taille) dans les commandes.
--
-- Le prix d'une ligne de commande est toujours relu en base (jamais celui
-- envoyé par le navigateur). Avec une variante, c'est le prix de la variante
-- (par ex. XXL plus cher que M/L), et la ligne garde son libellé lisible
-- (« Rose · XL ») pour le vendeur et l'acheteur.
--
-- Un produit qui a des variantes actives ne peut pas être commandé sans en
-- choisir une : sinon le vendeur ne saurait pas quoi expédier.

create or replace function public.order_items_set_commission()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_variant public.product_variants;
begin
  select p.shop_id, p.price into new.shop_id, new.unit_price
  from products p
  where p.id = new.product_id;
  if new.unit_price is null then raise exception 'product_not_found'; end if;
  if coalesce(new.quantity, 0) < 1 then raise exception 'invalid_quantity'; end if;

  if new.variant_id is not null then
    select * into v_variant from product_variants
    where id = new.variant_id and product_id = new.product_id and is_active;
    if v_variant.id is null then raise exception 'variant_invalid'; end if;
    if v_variant.stock is not null and v_variant.stock < new.quantity then raise exception 'out_of_stock'; end if;
    new.unit_price := coalesce(v_variant.price, new.unit_price);
    new.variant_label := concat_ws(' · ', v_variant.color, v_variant.size);
  elsif exists (select 1 from product_variants where product_id = new.product_id and is_active) then
    raise exception 'variant_required';
  else
    new.variant_label := null;
  end if;

  if exists (select 1 from orders o where o.id = new.order_id and o.status <> 'pending')
     or exists (select 1 from payments py where py.order_id = new.order_id
                and (py.status = 'paid' or py.verification_status = 'declared')) then
    raise exception 'order_locked';
  end if;

  new.commission_rate   := coalesce(public.resolve_commission_rate(new.product_id), 8);
  new.commission_amount := round(new.unit_price * new.quantity * new.commission_rate / 100, 2);
  return new;
end;
$function$;
