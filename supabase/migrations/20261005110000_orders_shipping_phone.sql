-- Téléphone du destinataire : indispensable au livreur / vendeur.
alter table public.orders add column if not exists shipping_phone text;

-- Enregistré par l'acheteur juste après submit_checkout (un acheteur ne
-- peut pas modifier `orders` directement).
create or replace function public.set_order_phone(p_order_id uuid, p_phone text)
returns void language sql security definer set search_path = public as $fn$
  update public.orders set shipping_phone = nullif(trim(coalesce(p_phone, '')), ''), updated_at = now()
  where id = p_order_id and user_id = public.my_user_id() and status in ('pending', 'processing');
$fn$;
revoke all on function public.set_order_phone(uuid, text) from public, anon;
grant execute on function public.set_order_phone(uuid, text) to authenticated;
