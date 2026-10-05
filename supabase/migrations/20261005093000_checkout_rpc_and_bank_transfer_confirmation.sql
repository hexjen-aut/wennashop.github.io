-- Référence de paiement lisible, dérivée de l'id de commande : c'est le
-- « motif » que l'acheteur indique sur son virement.
create or replace function public.order_payment_reference(p_order_id uuid)
returns text language sql immutable as $$
  select 'WS-' || upper(substr(replace(p_order_id::text, '-', ''), 1, 8))
$$;

-- Validation du formulaire de paiement par l'acheteur. Les acheteurs n'ont
-- pas le droit de modifier `orders` directement (RLS) : avant, l'adresse et
-- le statut envoyés depuis le navigateur étaient refusés silencieusement.
--   - paiement à la livraison : la commande part en préparation ;
--   - virement : elle reste « pending » jusqu'à ce que l'admin confirme la
--     réception des fonds (confirm_bank_transfer) ;
--   - mobile money : seule l'adresse est enregistrée, le webhook SingPay
--     valide la commande une fois le paiement fait.
create or replace function public.submit_checkout(
  p_order_id uuid, p_name text, p_address text, p_city text,
  p_country text, p_notes text, p_method text
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.my_user_id();
  v_order public.orders%rowtype;
  v_ref text := public.order_payment_reference(p_order_id);
  v_status text;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.user_id is distinct from v_me then
    raise exception 'order_not_found';
  end if;
  if v_order.status <> 'pending' then
    return json_build_object('status', v_order.status, 'reference', v_ref, 'already', true);
  end if;
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_address), '') = '' or coalesce(trim(p_city), '') = '' then
    raise exception 'missing_shipping';
  end if;
  if p_method not in ('cash_on_delivery', 'virement', 'airtel_money', 'moov_money') then
    raise exception 'invalid_method';
  end if;

  v_status := case when p_method = 'cash_on_delivery' then 'processing' else 'pending' end;

  update public.orders set
    shipping_name = trim(p_name),
    shipping_address = trim(p_address),
    shipping_city = trim(p_city),
    shipping_country = p_country,
    notes = nullif(trim(coalesce(p_notes, '')), ''),
    status = v_status,
    updated_at = now()
  where id = p_order_id;

  if p_method in ('cash_on_delivery', 'virement') then
    insert into public.payments (order_id, user_id, amount, currency, method, status, type, provider, metadata)
    values (
      p_order_id, v_me,
      coalesce(v_order.buyer_total_amount, v_order.total_amount),
      coalesce(v_order.buyer_currency, v_order.currency, 'MAD'),
      p_method, 'pending', 'order_payment', 'manual',
      jsonb_build_object('reference', v_ref)
    )
    on conflict (order_id) where (type = 'order_payment' and order_id is not null)
    do update set
      method = excluded.method,
      amount = excluded.amount,
      currency = excluded.currency,
      provider = 'manual',
      metadata = coalesce(public.payments.metadata, '{}'::jsonb) || excluded.metadata,
      updated_at = now()
    where public.payments.status = 'pending';
  end if;

  return json_build_object('status', v_status, 'reference', v_ref);
end;
$$;

revoke all on function public.submit_checkout(uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.submit_checkout(uuid, text, text, text, text, text, text) to authenticated;

-- L'admin confirme qu'un virement est bien arrivé sur le compte : le
-- paiement passe à « paid » et la commande en préparation.
create or replace function public.confirm_bank_transfer(p_order_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare v_payments int; v_orders int;
begin
  if coalesce(public.get_my_role(), '') <> 'admin' then raise exception 'forbidden'; end if;

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
$$;

revoke all on function public.confirm_bank_transfer(uuid) from public, anon;
grant execute on function public.confirm_bank_transfer(uuid) to authenticated;
