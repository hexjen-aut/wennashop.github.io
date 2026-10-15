-- Visite guidée de l'admin et de la page de vérification des paiements :
-- une date par personne, comme vendor_tour_completed_at / hunter_tour_completed_at.
alter table public.users
  add column if not exists admin_tour_completed_at timestamptz,
  add column if not exists agent_tour_completed_at timestamptz;

-- L'ancien bouton « Virement reçu » (Admin → Paiements) ne s'applique plus
-- qu'aux virements d'avant le circuit manuel. Un virement du circuit manuel
-- se valide dans /admin/paiements (montant reçu contrôlé, historique), sinon
-- il restait « en attente de paiement » et la tâche d'expiration le passait
-- en échec alors qu'il était payé.
create or replace function public.confirm_bank_transfer(p_order_id uuid)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_payments int; v_orders int;
begin
  if coalesce(public.get_my_role(), '') <> 'admin' then raise exception 'forbidden'; end if;

  if exists (select 1 from public.payments where order_id = p_order_id and type = 'order_payment'
             and verification_status is not null) then
    raise exception 'use_payment_review';
  end if;

  update public.payments set
    status = 'paid',
    updated_at = now(),
    metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object('confirmed_by', public.my_user_id(), 'confirmed_at', now())
  where order_id = p_order_id and type = 'order_payment' and method = 'virement' and status = 'pending';
  get diagnostics v_payments = row_count;

  if v_payments = 0 then raise exception 'no_pending_transfer'; end if;

  update public.orders set status = 'processing', updated_at = now()
  where id = p_order_id and status = 'pending';
  get diagnostics v_orders = row_count;

  return json_build_object('payment_confirmed', true, 'order_moved', v_orders > 0);
end;
$function$;

-- Un paiement déjà payé n'expire jamais
create or replace function public.expire_manual_payments()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_count integer := 0;
begin
  for r in
    select p.id, p.order_id, p.user_id, p.reference
    from public.payments p
    where p.verification_status = 'awaiting_payment' and p.status = 'pending' and p.expires_at < now()
    for update skip locked
  loop
    update public.payments set verification_status = 'expired', status = 'failed', updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('expired_at', now())
    where id = r.id;
    update public.orders set status = 'cancelled', updated_at = now()
    where id = r.order_id and status = 'pending';
    insert into public.notifications (user_id, type, title, body, link)
    values (r.user_id, 'order', 'Commande annulée — ' || r.reference,
      'Le délai de paiement est dépassé. Tu peux repasser ta commande quand tu veux.', '/compte');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.expire_manual_payments() from public, anon, authenticated;
