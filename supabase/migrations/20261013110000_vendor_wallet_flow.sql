-- Portefeuille vendeur : recharge, achat de boost, sécurité.
--
-- Avant :
-- - la recharge écrivait directement dans payments (type 'wallet_recharge',
--   refusé par la contrainte, et insert client interdit depuis Airtel) et
--   dans wallet_transactions (réservé à l'admin) : rien n'était enregistré ;
-- - l'achat de boost créait le boost depuis le navigateur puis tentait de
--   débiter le portefeuille (réservé à l'admin) : boost actif, solde intact ;
-- - un vendeur pouvait créer son propre portefeuille avec n'importe quel solde ;
-- - purchase_boost choisissait le prix selon la devise envoyée par le client
--   (un portefeuille en FCFA payait le prix en MAD : 95 au lieu de 5 000).
--
-- Après : tout passe par trois fonctions serveur. Le vendeur demande une
-- recharge (paiement 'wallet_topup' en attente), l'admin confirme la
-- réception de l'argent, le portefeuille est crédité ; l'achat de boost
-- débite et crée le boost en une seule transaction.

-- ── Plus d'écriture directe côté vendeur ──
alter policy vendor_wallets_insert on public.vendor_wallets
  with check (public.get_my_role() = 'admin');
alter policy boosts_owner_insert on public.boosts
  with check (false);

-- Devise du portefeuille : MAD pour une boutique au Maroc, FCFA sinon
-- (les packs n'existent qu'en MAD et en FCFA).
create or replace function public.wallet_currency_for(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when lower(coalesce(
      (select s.country from public.shops s where s.user_id = p_user_id order by s.created_at limit 1),
      (select u.country from public.users u where u.id = p_user_id),
      ''
    )) like '%maroc%' then 'MAD'
    else 'FCFA'
  end
$$;

revoke all on function public.wallet_currency_for(uuid) from public, anon, authenticated;

-- ── Le vendeur demande une recharge ──
create or replace function public.request_wallet_recharge(p_pack_id uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.my_user_id();
  v_shop uuid;
  v_pack record;
  v_wallet record;
  v_amount numeric;
  v_ref text;
  v_pay uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  select id into v_shop from public.shops where user_id = v_me order by created_at limit 1;
  if v_shop is null then raise exception 'not_a_seller'; end if;

  select * into v_pack from public.boost_packs where id = p_pack_id and is_active;
  if not found then raise exception 'pack_not_found'; end if;

  insert into public.vendor_wallets (user_id, balance, currency)
  values (v_me, 0, public.wallet_currency_for(v_me))
  on conflict (user_id) do nothing;
  select * into v_wallet from public.vendor_wallets where user_id = v_me;

  v_amount := case when v_wallet.currency = 'MAD' then v_pack.price_mad else v_pack.price_fcfa end;
  if coalesce(v_amount, 0) <= 0 then raise exception 'pack_not_payable'; end if;

  if exists (select 1 from public.payments where user_id = v_me and type = 'wallet_topup' and status = 'pending') then
    raise exception 'recharge_pending';
  end if;

  v_ref := 'RCH-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  insert into public.payments (user_id, amount, currency, method, status, type, provider, reference, metadata)
  values (v_me, v_amount, v_wallet.currency, 'manual', 'pending', 'wallet_topup', 'manual', v_ref,
          jsonb_build_object('pack_id', v_pack.id, 'pack_name', v_pack.name))
  returning id into v_pay;

  insert into public.wallet_transactions (user_id, shop_id, type, amount, currency, description, reference, status)
  values (v_me, v_shop, 'credit', v_amount, v_wallet.currency, 'Recharge — ' || v_pack.name, v_ref, 'pending');

  return json_build_object('payment_id', v_pay, 'reference', v_ref, 'amount', v_amount, 'currency', v_wallet.currency);
end;
$$;

revoke all on function public.request_wallet_recharge(uuid) from public, anon;
grant execute on function public.request_wallet_recharge(uuid) to authenticated;

-- ── L'admin confirme (argent reçu) ou refuse la recharge ──
create or replace function public.admin_resolve_wallet_recharge(p_payment_id uuid, p_approve boolean, p_note text default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay record;
begin
  if public.get_my_role() is distinct from 'admin' then raise exception 'forbidden'; end if;

  select * into v_pay from public.payments where id = p_payment_id and type = 'wallet_topup' for update;
  if not found then raise exception 'not_found'; end if;
  if v_pay.status <> 'pending' then
    return json_build_object('status', v_pay.status, 'already', true);
  end if;

  if p_approve then
    update public.vendor_wallets
      set balance = balance + v_pay.amount, updated_at = now()
      where user_id = v_pay.user_id and currency = v_pay.currency;
    if not found then raise exception 'wallet_mismatch'; end if;
  end if;

  update public.payments set
    status = case when p_approve then 'paid' else 'failed' end,
    updated_at = now(),
    metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object('resolved_by', public.my_user_id(), 'resolved_at', now(), 'note', p_note)
  where id = p_payment_id;

  update public.wallet_transactions
    set status = case when p_approve then 'completed' else 'failed' end
    where user_id = v_pay.user_id and reference = v_pay.reference and status = 'pending';

  return json_build_object('status', case when p_approve then 'paid' else 'failed' end);
end;
$$;

revoke all on function public.admin_resolve_wallet_recharge(uuid, boolean, text) from public, anon;
grant execute on function public.admin_resolve_wallet_recharge(uuid, boolean, text) to authenticated;

-- ── Achat de boost : prix dans la devise du portefeuille, jamais celle
-- envoyée par le client (p_currency est conservé pour la signature mais
-- ignoré). Refus si le pack ne crée aucun boost (ex. Starter sans produit)
-- ou s'il est gratuit (pack réservé à l'admin).
create or replace function public.purchase_boost(p_user_id uuid, p_pack_id uuid, p_product_id uuid default null, p_shop_id uuid default null, p_currency text default 'FCFA')
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_pack        boost_packs%rowtype;
  v_wallet      vendor_wallets%rowtype;
  v_price       numeric;
  v_tx_id       uuid;
  v_boost_id    uuid;
  v_expires_at  timestamptz;
begin
  -- Appelant : le propriétaire du portefeuille, ou le serveur
  if coalesce(auth.role(), '') <> 'service_role'
     and p_user_id is distinct from public.my_user_id() then
    return jsonb_build_object('success', false, 'error', 'Non autorisé');
  end if;
  if p_shop_id is not null
     and not exists (select 1 from shops where id = p_shop_id and user_id = p_user_id) then
    return jsonb_build_object('success', false, 'error', 'Boutique introuvable');
  end if;
  if p_product_id is not null
     and not exists (select 1 from products where id = p_product_id and seller_id = p_user_id) then
    return jsonb_build_object('success', false, 'error', 'Produit introuvable');
  end if;

  select * into v_pack from boost_packs where id = p_pack_id and is_active = true;
  if not found then return jsonb_build_object('success', false, 'error', 'Pack introuvable'); end if;

  if not (
    (v_pack.slug in ('starter', 'pro', 'premium') and p_product_id is not null)
    or (v_pack.slug in ('pro', 'premium') and p_shop_id is not null)
  ) then
    return jsonb_build_object('success', false, 'error', case when v_pack.slug = 'starter'
      then 'Choisis le produit à mettre en avant' else 'Ce pack ne peut pas être acheté ici' end);
  end if;

  -- Portefeuille verrouillé jusqu'au débit ; son prix dans sa devise
  select * into v_wallet from vendor_wallets where user_id = p_user_id for update;
  if not found then return jsonb_build_object('success', false, 'error', 'Solde insuffisant', 'balance', 0); end if;

  v_price := case when v_wallet.currency = 'MAD' then v_pack.price_mad else v_pack.price_fcfa end;
  if coalesce(v_price, 0) <= 0 then
    return jsonb_build_object('success', false, 'error', 'Ce pack ne peut pas être acheté ici');
  end if;

  if v_wallet.balance < v_price then
    return jsonb_build_object('success', false, 'error', 'Solde insuffisant', 'balance', v_wallet.balance, 'required', v_price);
  end if;

  update vendor_wallets set balance = balance - v_price, updated_at = now() where user_id = p_user_id;

  insert into wallet_transactions (user_id, shop_id, type, amount, currency, description, status)
  values (p_user_id, p_shop_id, 'debit', v_price, v_wallet.currency, 'Boost ' || v_pack.name, 'completed')
  returning id into v_tx_id;

  v_expires_at := now() + (v_pack.duration_days || ' days')::interval;

  -- Starter, Pro, Premium : produit mis en avant
  if v_pack.slug in ('starter', 'pro', 'premium') and p_product_id is not null then
    insert into boosts (user_id, shop_id, product_id, pack_id, type, expires_at, wallet_tx_id, amount_paid, currency)
    values (p_user_id, p_shop_id, p_product_id, p_pack_id, 'product_featured', v_expires_at, v_tx_id, v_price, v_wallet.currency)
    returning id into v_boost_id;
  end if;

  -- Pro, Premium : badge top vendeur
  if v_pack.slug in ('pro', 'premium') and p_shop_id is not null then
    insert into boosts (user_id, shop_id, product_id, pack_id, type, expires_at, wallet_tx_id, amount_paid, currency)
    values (p_user_id, p_shop_id, p_product_id, p_pack_id, 'badge_top_seller', v_expires_at, v_tx_id, v_price, v_wallet.currency)
    returning id into v_boost_id;
  end if;

  -- Premium : boutique en page d'accueil + quêtes
  if v_pack.slug = 'premium' and p_shop_id is not null then
    insert into boosts (user_id, shop_id, product_id, pack_id, type, expires_at, wallet_tx_id, amount_paid, currency)
    values (p_user_id, p_shop_id, p_product_id, p_pack_id, 'shop_homepage', v_expires_at, v_tx_id, v_price, v_wallet.currency);
    insert into boosts (user_id, shop_id, product_id, pack_id, type, expires_at, wallet_tx_id, amount_paid, currency)
    values (p_user_id, p_shop_id, p_product_id, p_pack_id, 'quest_boost', v_expires_at, v_tx_id, v_price, v_wallet.currency);
  end if;

  return jsonb_build_object(
    'success', true,
    'boost_id', v_boost_id,
    'expires_at', v_expires_at,
    'amount_deducted', v_price,
    'currency', v_wallet.currency,
    'new_balance', v_wallet.balance - v_price
  );
end;
$function$;
