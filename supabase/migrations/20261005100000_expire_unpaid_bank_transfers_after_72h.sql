create extension if not exists pg_cron;

-- Annule les commandes payées par virement dont l'argent n'est pas arrivé
-- 72 h après la validation (payments.updated_at = moment où l'acheteur a
-- choisi le virement, voir submit_checkout). Prévient l'acheteur et le
-- vendeur. Le stock n'est jamais réservé à la commande : rien à libérer.
create or replace function public.expire_unpaid_bank_transfers()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_count integer := 0;
  v_ref text;
begin
  for r in
    select p.id as payment_id, p.order_id, o.user_id as buyer_id
    from public.payments p
    join public.orders o on o.id = p.order_id
    where p.type = 'order_payment'
      and p.method = 'virement'
      and p.status = 'pending'
      and o.status = 'pending'
      and p.updated_at < now() - interval '72 hours'
    for update of p, o skip locked
  loop
    v_ref := public.order_payment_reference(r.order_id);

    update public.payments set
      status = 'failed',
      updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object('expired_at', now(), 'expired_reason', 'virement non reçu sous 72 h')
    where id = r.payment_id;

    update public.orders set status = 'cancelled', updated_at = now()
    where id = r.order_id;

    insert into public.notifications (user_id, type, title, body, link)
    values (
      r.buyer_id, 'order', 'Commande annulée',
      'Ta commande ' || v_ref || ' a été annulée : nous n''avons pas reçu ton virement dans les 72 h. Tu peux la repasser quand tu veux.',
      '/compte'
    );

    insert into public.notifications (user_id, type, title, body, link)
    select distinct pr.seller_id, 'order', 'Commande annulée',
      'La commande ' || v_ref || ' a été annulée : le virement de l''acheteur n''est pas arrivé dans les 72 h. Ne l''expédie pas.',
      '/vendeur'
    from public.order_items oi
    join public.products pr on pr.id = oi.product_id
    where oi.order_id = r.order_id and pr.seller_id is not null;

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.expire_unpaid_bank_transfers() from public, anon, authenticated;

-- Toutes les heures (à la 15e minute).
select cron.unschedule(jobid) from cron.job where jobname = 'expire-unpaid-bank-transfers';
select cron.schedule('expire-unpaid-bank-transfers', '15 * * * *', 'select public.expire_unpaid_bank_transfers()');
