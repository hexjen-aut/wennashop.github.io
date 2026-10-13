-- Circuit de paiement MANUEL vérifié par un agent : Airtel Money (GA),
-- Moov Money (GA), virement bancaire (MA).
--
-- Le client paie hors du site, déclare son paiement (ID de transaction), un
-- agent vérifie et valide ou refuse. Plus tard, l'API Airtel / SingPay
-- remplacera l'agent : seule l'étape de vérification change (le callback
-- fera la même transition que review_payment 'validate').
--
-- Statuts (choix : compatibilité avec l'existant) :
--   payments.verification_status  awaiting_payment | declared | validated | rejected | expired
--   payments.status (inchangé)     pending            pending    paid        pending    failed
--   orders.status                  pending            pending    processing  pending    cancelled
-- « rejected » est l'état d'une revue (historique) ; le paiement repasse en
-- awaiting_payment avec reject_reason, le client peut redéclarer.
--
-- Corrige aussi au passage :
--   - montants calculés dans le navigateur (prix unitaires et total acheteur) :
--     désormais imposés et recalculés en base ;
--   - un acheteur pouvait créer une commande déjà « processing », un vendeur
--     passer sa commande en « processing » sans paiement ;
--   - le vendeur était prévenu d'une commande avant tout paiement.

-- ═════════════════ 1. Équipe : agents de paiement ═════════════════
create table if not exists public.staff_roles (
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('payment_agent')),
  granted_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);
alter table public.staff_roles enable row level security;
create policy staff_roles_admin_all on public.staff_roles for all to authenticated
  using (public.get_my_role() = 'admin') with check (public.get_my_role() = 'admin');
create policy staff_roles_select_own on public.staff_roles for select to authenticated
  using (user_id = public.my_user_id());

-- Admin ou agent de paiement (SECURITY DEFINER : pas de récursion RLS)
create or replace function public.is_payment_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.get_my_role() = 'admin'
    or exists (select 1 from public.staff_roles r where r.user_id = public.my_user_id() and r.role = 'payment_agent')
$$;
grant execute on function public.is_payment_staff() to authenticated;

-- ═════════════════ 2. Moyens de paiement et comptes de réception ═════════════════
alter table public.payment_methods
  add column if not exists fees_paid_by text not null default 'customer' check (fees_paid_by in ('customer', 'merchant'));

-- Comptes par pays (lecture publique déjà en place sur country_payment_methods)
alter table public.country_payment_methods
  add column if not exists currency text,
  add column if not exists account_number text,
  add column if not exists account_holder text,
  add column if not exists instructions text;

update public.country_payment_methods set currency = 'XAF'
  where country_code = 'GA' and payment_method_code in ('airtel_money', 'moov_money') and currency is null;
update public.country_payment_methods set currency = 'MAD'
  where country_code = 'MA' and payment_method_code = 'virement' and currency is null;

-- Reprend le compte bancaire Maroc déjà saisi dans site_config.bank_accounts
update public.country_payment_methods c set
  account_number = coalesce(c.account_number, a->>'rib'),
  account_holder = coalesce(c.account_holder, nullif(a->>'holder', ''), nullif(a->>'bank_name', '')),
  instructions = coalesce(c.instructions, 'Banque : ' || coalesce(a->>'bank_name', '—') || '. Indique la référence WN-… en motif du virement.')
from (
  select jsonb_array_elements(value::jsonb) a from public.site_config
  where key = 'bank_accounts' and value is not null and value <> ''
) b
where c.country_code = 'MA' and c.payment_method_code = 'virement' and a->>'country_code' = 'MA';

update public.country_payment_methods set instructions =
  'Envoie le montant exact au numéro ci-dessous, puis déclare ton paiement avec l''ID de transaction reçu par SMS.'
  where country_code = 'GA' and payment_method_code in ('airtel_money', 'moov_money') and instructions is null;

-- ═════════════════ 3. Paiements ═════════════════
alter table public.payments
  add column if not exists verification_status text
    check (verification_status in ('awaiting_payment', 'declared', 'validated', 'rejected', 'expired')),
  add column if not exists amount_received numeric,
  add column if not exists sender_number text,
  add column if not exists proof_path text,
  add column if not exists reject_reason text,
  add column if not exists on_hold boolean not null default false,
  add column if not exists declared_at timestamptz,
  add column if not exists validated_at timestamptz,
  add column if not exists validated_by uuid references public.users(id),
  add column if not exists expires_at timestamptz;

-- Un ID de transaction ne sert qu'une fois par moyen de paiement (circuit manuel)
create unique index if not exists payments_manual_txn_unique
  on public.payments (payment_method_code, transaction_id)
  where verification_status is not null and transaction_id is not null;
create index if not exists payments_verification_queue
  on public.payments (verification_status, declared_at)
  where verification_status is not null;

-- Les agents lisent les paiements (écriture : uniquement via review_payment)
create policy payments_select_staff on public.payments for select to authenticated
  using (public.is_payment_staff());

-- Historique des revues : insertion seule, par les fonctions serveur
create table if not exists public.payment_reviews (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  agent_id uuid references public.users(id),
  action text not null check (action in ('validate', 'reject', 'hold')),
  reason text,
  amount_received numeric,
  transaction_id text,
  created_at timestamptz not null default now()
);
create index if not exists payment_reviews_payment on public.payment_reviews (payment_id, created_at);
alter table public.payment_reviews enable row level security;
create policy payment_reviews_select_staff on public.payment_reviews for select to authenticated
  using (public.is_payment_staff());
revoke insert, update, delete, truncate on public.payment_reviews from anon, authenticated;

-- Captures de paiement : bucket privé, chemin <auth.uid()>/<payment_id>/fichier
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;
create policy payment_proofs_upload_own on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy payment_proofs_read_own on storage.objects for select to authenticated
  using (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy payment_proofs_read_staff on storage.objects for select to authenticated
  using (bucket_id = 'payment-proofs' and public.is_payment_staff());

-- ═════════════════ 4. Montants imposés par la base ═════════════════
-- Prix unitaire = prix du produit (plus jamais celui envoyé par le navigateur),
-- et pas d'ajout d'article à une commande déjà payée ou en cours de paiement.
create or replace function public.order_items_set_commission()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  select p.shop_id, p.price into new.shop_id, new.unit_price
  from products p
  where p.id = new.product_id;
  if new.unit_price is null then raise exception 'product_not_found'; end if;
  if coalesce(new.quantity, 0) < 1 then raise exception 'invalid_quantity'; end if;

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

-- Total dû par l'acheteur, dans une devise donnée, recalculé en base.
-- Quête : montant fixé côté serveur par start_quest_checkout.
-- Sinon : somme des articles (prix du vendeur) convertie avec la marge.
-- FCFA en entiers ; autres devises arrondies au supérieur à l'unité.
create or replace function public.order_amount_due(p_order_id uuid, p_currency text)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_cur text := case when upper(p_currency) = 'FCFA' then 'XAF' else upper(p_currency) end;
  v_total numeric;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then return null; end if;

  if v_order.quest_proposal_id is not null then
    v_total := case
      when upper(coalesce(v_order.buyer_currency, '')) in (v_cur, case when v_cur = 'XAF' then 'FCFA' end) then v_order.buyer_total_amount
      else public.convert_amount(v_order.total_amount, v_order.currency, v_cur)
    end;
  else
    -- Chaque article converti depuis la devise de SON produit (jamais celle
    -- déclarée par le navigateur sur la commande)
    select sum(public.convert_amount(oi.unit_price * oi.quantity, coalesce(pr.currency, v_order.currency), v_cur))
      into v_total
    from public.order_items oi left join public.products pr on pr.id = oi.product_id
    where oi.order_id = p_order_id;
  end if;

  if v_total is null or v_total <= 0 then return null; end if;
  return ceil(v_total);
end;
$$;
revoke all on function public.order_amount_due(uuid, text) from public, anon;
grant execute on function public.order_amount_due(uuid, text) to authenticated;

-- Après l'ajout des articles : totaux de la commande recalculés en base
-- (ce que lisent la page de paiement, Airtel direct et SingPay).
create or replace function public.orders_recompute_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_sub numeric;
  v_cur text;
  v_buyer numeric;
  v_order record;
begin
  for v_id in select distinct order_id from new_items loop
    select * into v_order from public.orders where id = v_id;
    if not found or v_order.quest_proposal_id is not null then continue; end if;
    -- Devise de la commande = devise des produits (un panier = une boutique)
    select pr.currency into v_cur
    from public.order_items oi join public.products pr on pr.id = oi.product_id
    where oi.order_id = v_id limit 1;
    v_cur := coalesce(v_cur, v_order.currency);
    select sum(unit_price * quantity) into v_sub from public.order_items where order_id = v_id;
    v_buyer := public.convert_amount(v_sub, v_cur, coalesce(v_order.buyer_currency, v_cur));
    -- Devise acheteur sans taux connu : on facture dans la devise du vendeur
    update public.orders set
      currency = v_cur,
      subtotal = v_sub,
      total_amount = v_sub,
      buyer_total_amount = coalesce(v_buyer, v_sub),
      buyer_currency = case when v_buyer is null then v_cur else buyer_currency end,
      updated_at = now()
    where id = v_id;
  end loop;
  return null;
end;
$$;

create trigger trg_orders_recompute_totals
  after insert on public.order_items
  referencing new table as new_items
  for each statement execute function public.orders_recompute_totals();

-- Numéro de suivi : 4 caractères de l'id ne suffisaient pas (deux commandes
-- du même jour entraient en collision et la seconde échouait).
create or replace function public.generate_tracking_number()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_try int := 0;
begin
  if new.tracking_number is null then
    loop
      new.tracking_number := 'WNS-' || to_char(now(), 'YYYYMMDD') || '-'
        || upper(case when v_try = 0 then substring(replace(new.id::text, '-', ''), 1, 8)
                      else substring(md5(random()::text), 1, 8) end);
      exit when not exists (select 1 from public.orders where tracking_number = new.tracking_number);
      v_try := v_try + 1;
    end loop;
  end if;
  return new;
end;
$function$;

-- ═════════════════ 5. Garde-fous sur les commandes ═════════════════
-- (SECURITY INVOKER : current_user est le rôle de l'appelant ; les fonctions
-- serveur, l'admin et le service_role ne sont pas concernés.)
create or replace function public.orders_guard_client()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') or public.get_my_role() = 'admin' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Une commande naît toujours en attente ; les montants sont recalculés
    -- à l'ajout des articles.
    new.status := 'pending';
    new.quest_id := null;
    new.quest_proposal_id := null;
    new.discount_pct := 0;
    new.promo_code := null;
    return new;
  end if;

  -- Mise à jour (seul le vendeur a ce droit) : montants et acheteur figés,
  -- statut seulement dans l'ordre normal de livraison.
  if new.user_id is distinct from old.user_id
     or new.total_amount is distinct from old.total_amount
     or new.subtotal is distinct from old.subtotal
     or new.currency is distinct from old.currency
     or new.buyer_total_amount is distinct from old.buyer_total_amount
     or new.buyer_currency is distinct from old.buyer_currency
     or new.discount_pct is distinct from old.discount_pct
     or new.quest_id is distinct from old.quest_id
     or new.quest_proposal_id is distinct from old.quest_proposal_id then
    raise exception 'Ces informations de commande ne peuvent pas être modifiées.' using errcode = '42501';
  end if;

  if new.status is distinct from old.status and not (
       (old.status = 'pending' and new.status = 'cancelled')
    or (old.status = 'processing' and new.status in ('shipped', 'delivered', 'cancelled'))
    or (old.status = 'shipped' and new.status in ('delivered', 'returned', 'cancelled'))
    or (old.status = 'delivered' and new.status = 'returned')
  ) then
    raise exception 'Une commande passe en préparation uniquement après paiement confirmé.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger trg_orders_guard_client
  before insert or update on public.orders
  for each row execute function public.orders_guard_client();

-- ═════════════════ 6. Vendeur prévenu au paiement, pas avant ═════════════════
alter table public.order_items disable trigger trg_notify_vendor_new_order;

create or replace function public.notify_vendor_order_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'pending' and new.status = 'processing' then
    insert into public.notifications (user_id, type, title, body, link)
    select distinct s.user_id, 'order', 'Nouvelle commande à préparer',
      'Commande ' || public.order_payment_reference(new.id) || ' confirmée'
        || case when exists (select 1 from public.payments p where p.order_id = new.id and p.status = 'paid')
                then ' et payée' else ' (paiement à la livraison)' end
        || ' : tu peux la préparer.',
      '/vendeur'
    from public.order_items oi
    join public.shops s on s.id = oi.shop_id
    where oi.order_id = new.id and s.user_id is not null;
  end if;
  return new;
end;
$$;

create trigger trg_notify_vendor_order_confirmed
  after update of status on public.orders
  for each row execute function public.notify_vendor_order_confirmed();

-- ═════════════════ 7. Reversements vendeurs ═════════════════
create table if not exists public.settlements (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete restrict,
  shop_id uuid references public.shops(id),
  vendor_id uuid references public.users(id),
  currency text not null,
  gross numeric not null,
  commission numeric not null,
  net numeric not null,
  method text,
  destination_number text,
  transaction_id text,
  status text not null default 'pending' check (status in ('pending', 'paid')),
  paid_by uuid references public.users(id),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.settlements enable row level security;
create policy settlements_admin_all on public.settlements for all to authenticated
  using (public.get_my_role() = 'admin') with check (public.get_my_role() = 'admin');
create policy settlements_select_vendor on public.settlements for select to authenticated
  using (public.can_manage_seller(vendor_id));

-- Commande livrée ET payée en ligne / manuellement → ligne à reverser
-- (le paiement à la livraison est encaissé directement par le vendeur).
create or replace function public.orders_create_settlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop record;
  v_gross numeric;
  v_comm numeric;
begin
  if new.status <> 'delivered' or old.status = 'delivered' then return new; end if;
  if not exists (select 1 from public.payments p where p.order_id = new.id and p.type = 'order_payment' and p.status = 'paid') then
    return new;
  end if;

  select s.id, s.user_id into v_shop
  from public.order_items oi join public.shops s on s.id = oi.shop_id
  where oi.order_id = new.id limit 1;
  if v_shop.id is null then return new; end if;

  select sum(unit_price * quantity), sum(coalesce(commission_amount, 0)) into v_gross, v_comm
  from public.order_items where order_id = new.id;

  insert into public.settlements (order_id, shop_id, vendor_id, currency, gross, commission, net)
  values (new.id, v_shop.id, v_shop.user_id, new.currency, v_gross, v_comm, v_gross - v_comm)
  on conflict (order_id) do nothing;
  return new;
end;
$$;

create trigger trg_orders_create_settlement
  after update of status on public.orders
  for each row execute function public.orders_create_settlement();

create or replace function public.mark_settlement_paid(p_settlement_id uuid, p_transaction_id text, p_method text default null, p_destination text default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.get_my_role() is distinct from 'admin' then raise exception 'forbidden'; end if;
  if coalesce(trim(p_transaction_id), '') = '' then raise exception 'transaction_id_required'; end if;
  update public.settlements set
    status = 'paid', transaction_id = trim(p_transaction_id),
    method = coalesce(nullif(trim(coalesce(p_method, '')), ''), method),
    destination_number = coalesce(nullif(trim(coalesce(p_destination, '')), ''), destination_number),
    paid_by = public.my_user_id(), paid_at = now()
  where id = p_settlement_id and status = 'pending';
  if not found then raise exception 'not_pending'; end if;
  insert into public.notifications (user_id, type, title, body, link)
  select vendor_id, 'money', 'Reversement envoyé',
    'Ton reversement de ' || net || ' ' || currency || ' a été envoyé (transaction ' || trim(p_transaction_id) || ').', '/vendeur'
  from public.settlements where id = p_settlement_id and vendor_id is not null;
  return json_build_object('status', 'paid');
end;
$$;
revoke all on function public.mark_settlement_paid(uuid, text, text, text) from public, anon;
grant execute on function public.mark_settlement_paid(uuid, text, text, text) to authenticated;

-- ═════════════════ 8. Circuit manuel : créer, déclarer, vérifier ═════════════════
-- Référence WN-XXXXX (5 caractères sans 0/O/1/I pour éviter les confusions)
create or replace function public.new_payment_reference()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_ref text;
begin
  loop
    v_ref := 'WN-';
    for i in 1..5 loop
      v_ref := v_ref || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
    end loop;
    exit when not exists (select 1 from public.payments where reference = v_ref);
  end loop;
  return v_ref;
end;
$$;

create or replace function public.create_manual_payment(p_order_id uuid, p_method_code text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.my_user_id();
  v_order record;
  v_method record;
  v_account record;
  v_country text;
  v_amount numeric;
  v_existing record;
  v_ref text;
  v_pay uuid;
  v_expires timestamptz := now() + interval '24 hours';
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.user_id is distinct from v_me then raise exception 'order_not_found'; end if;
  if v_order.status <> 'pending' then raise exception 'order_not_payable'; end if;

  select * into v_method from public.payment_methods where code = p_method_code;
  if not found or v_method.status <> 'ACTIVE' or v_method.provider_code <> 'manual' or p_method_code = 'cash_on_delivery' then
    raise exception 'method_not_available';
  end if;

  select code into v_country from public.countries where lower(name) = lower(coalesce(v_order.shipping_country, '')) limit 1;
  select * into v_account from public.country_payment_methods
  where payment_method_code = p_method_code and is_enabled
    and (country_code = v_country or v_country is null)
    and account_number is not null and currency is not null
  order by (country_code = v_country) desc nulls last
  limit 1;
  if not found then raise exception 'method_not_available'; end if;

  v_amount := public.order_amount_due(p_order_id, v_account.currency);
  if v_amount is null then raise exception 'amount_unavailable'; end if;

  select * into v_existing from public.payments
  where order_id = p_order_id and type = 'order_payment' for update;

  if found then
    if v_existing.status = 'paid' then raise exception 'already_paid'; end if;
    if v_existing.verification_status = 'declared' then raise exception 'payment_under_review'; end if;
    -- Un push Airtel direct encore en cours n'est pas écrasé (le client a pu valider)
    if v_existing.provider = 'airtel' and v_existing.status = 'pending' and v_existing.updated_at > now() - interval '15 minutes' then
      raise exception 'payment_in_progress';
    end if;
    -- Même moyen, même montant, toujours valable : on garde la même référence
    if v_existing.verification_status = 'awaiting_payment' and v_existing.payment_method_code = p_method_code
       and v_existing.amount = v_amount and v_existing.expires_at > now() then
      return json_build_object('payment_id', v_existing.id, 'reference', v_existing.reference, 'amount', v_amount,
        'currency', v_account.currency, 'expires_at', v_existing.expires_at);
    end if;
    v_ref := public.new_payment_reference();
    update public.payments set
      amount = v_amount, currency = v_account.currency, method = p_method_code, payment_method_code = p_method_code,
      provider = 'manual', status = 'pending', verification_status = 'awaiting_payment', reference = v_ref,
      transaction_id = null, sender_number = null, proof_path = null, reject_reason = null, on_hold = false,
      declared_at = null, validated_at = null, validated_by = null, amount_received = null,
      expires_at = v_expires, updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('previous_provider', v_existing.provider, 'previous_reference', v_existing.reference)
    where id = v_existing.id
    returning id into v_pay;
  else
    v_ref := public.new_payment_reference();
    insert into public.payments (order_id, user_id, amount, currency, method, payment_method_code, provider, type,
      status, verification_status, reference, expires_at, country)
    values (p_order_id, v_me, v_amount, v_account.currency, p_method_code, p_method_code, 'manual', 'order_payment',
      'pending', 'awaiting_payment', v_ref, v_expires, v_account.country_code)
    returning id into v_pay;
  end if;

  -- Instructions par notification (e-mail via send-notification-email)
  insert into public.notifications (user_id, type, title, body, link)
  values (v_me, 'order', 'Paiement à effectuer — ' || v_ref,
    'Envoie ' || v_amount || ' ' || case when v_account.currency = 'XAF' then 'FCFA' else v_account.currency end
      || ' par ' || v_method.name || ' au ' || v_account.account_number
      || coalesce(' (' || v_account.account_holder || ')', '')
      || ', référence ' || v_ref || ', avant le ' || to_char(v_expires at time zone 'UTC', 'DD/MM à HH24:MI') || ' UTC.'
      || ' Puis déclare ton paiement sur la page de ta commande.',
    '/commande/' || p_order_id);

  return json_build_object('payment_id', v_pay, 'reference', v_ref, 'amount', v_amount,
    'currency', v_account.currency, 'expires_at', v_expires);
end;
$$;
revoke all on function public.create_manual_payment(uuid, text) from public, anon;
grant execute on function public.create_manual_payment(uuid, text) to authenticated;

create or replace function public.declare_payment(p_payment_id uuid, p_transaction_id text, p_sender_number text, p_proof_path text default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.my_user_id();
  v_pay record;
  v_txn text := upper(regexp_replace(coalesce(p_transaction_id, ''), '\s', '', 'g'));
  v_sender text := nullif(regexp_replace(coalesce(p_sender_number, ''), '[^0-9+]', '', 'g'), '');
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found or v_pay.user_id is distinct from v_me then raise exception 'payment_not_found'; end if;
  if v_pay.verification_status is distinct from 'awaiting_payment' then raise exception 'not_awaiting_payment'; end if;
  if v_pay.expires_at < now() then raise exception 'payment_expired'; end if;
  if length(v_txn) < 4 or length(v_txn) > 40 then raise exception 'invalid_transaction_id'; end if;
  if p_proof_path is not null and split_part(p_proof_path, '/', 1) <> auth.uid()::text then
    raise exception 'invalid_proof_path';
  end if;
  if exists (select 1 from public.payments where payment_method_code = v_pay.payment_method_code
             and transaction_id = v_txn and id <> v_pay.id and verification_status is not null) then
    raise exception 'transaction_already_used';
  end if;

  update public.payments set
    verification_status = 'declared', transaction_id = v_txn, sender_number = v_sender,
    proof_path = p_proof_path, declared_at = now(), on_hold = false, updated_at = now()
  where id = p_payment_id;

  insert into public.notifications (user_id, type, title, body, link)
  values (v_me, 'order', 'Paiement déclaré — ' || v_pay.reference,
    'Merci ! Notre équipe vérifie ton paiement (ID ' || v_txn || '). Tu seras prévenu dès la validation.',
    '/commande/' || v_pay.order_id);

  return json_build_object('status', 'declared', 'reference', v_pay.reference);
end;
$$;
revoke all on function public.declare_payment(uuid, text, text, text) from public, anon;
grant execute on function public.declare_payment(uuid, text, text, text) to authenticated;

create or replace function public.review_payment(p_payment_id uuid, p_action text, p_amount_received numeric default null, p_reason text default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.my_user_id();
  v_pay record;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not public.is_payment_staff() then raise exception 'forbidden'; end if;
  if p_action not in ('validate', 'reject', 'hold') then raise exception 'invalid_action'; end if;

  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found or v_pay.verification_status is null then raise exception 'payment_not_found'; end if;
  -- Un agent ne vérifie jamais son propre paiement
  if v_pay.user_id = v_me and public.get_my_role() is distinct from 'admin' then raise exception 'forbidden'; end if;
  if v_pay.verification_status <> 'declared' then raise exception 'not_declared'; end if;

  insert into public.payment_reviews (payment_id, agent_id, action, reason, amount_received, transaction_id)
  values (p_payment_id, v_me, p_action, v_reason, p_amount_received, v_pay.transaction_id);

  if p_action = 'hold' then
    update public.payments set on_hold = true, updated_at = now() where id = p_payment_id;
    return json_build_object('status', 'declared', 'on_hold', true);
  end if;

  if p_action = 'reject' then
    if v_reason is null then raise exception 'reason_required'; end if;
    update public.payments set
      verification_status = 'awaiting_payment', reject_reason = v_reason,
      transaction_id = null, declared_at = null, on_hold = false,
      expires_at = greatest(coalesce(expires_at, now()), now()) + interval '12 hours',
      updated_at = now()
    where id = p_payment_id;
    insert into public.notifications (user_id, type, title, body, link)
    values (v_pay.user_id, 'order', 'Paiement non validé — ' || v_pay.reference,
      'Motif : ' || v_reason || '. Corrige et déclare à nouveau ton paiement depuis la page de ta commande.',
      '/commande/' || v_pay.order_id);
    return json_build_object('status', 'awaiting_payment', 'reject_reason', v_reason);
  end if;

  -- validate
  if p_amount_received is null or p_amount_received < v_pay.amount then
    raise exception 'amount_short';
  end if;
  update public.payments set
    status = 'paid', verification_status = 'validated', amount_received = p_amount_received,
    validated_at = now(), validated_by = v_me, on_hold = false, reject_reason = null, updated_at = now()
  where id = p_payment_id;

  -- Commande payée (déclenche : quête résolue, vendeur prévenu, etc.)
  update public.orders set status = 'processing', updated_at = now()
  where id = v_pay.order_id and status = 'pending';

  insert into public.notifications (user_id, type, title, body, link)
  values (v_pay.user_id, 'order', 'Paiement validé — ' || v_pay.reference,
    'Ton paiement est confirmé. Le vendeur prépare ta commande.', '/commande/' || v_pay.order_id);

  return json_build_object('status', 'validated');
end;
$$;
revoke all on function public.review_payment(uuid, text, numeric, text) from public, anon;
grant execute on function public.review_payment(uuid, text, numeric, text) to authenticated;

-- Paiement déclaré → notify-payment-declared (n8n → Telegram de l'équipe).
-- Même secret de coffre que les autres tâches serveur.
create or replace function public.payments_notify_declared()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.verification_status = 'declared' and old.verification_status is distinct from 'declared' then
    perform net.http_post(
      url := 'https://aakxoydznmybstfozjte.supabase.co/functions/v1/notify-payment-declared',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'airtel_cron_secret')
      ),
      body := jsonb_build_object('payment_id', new.id),
      timeout_milliseconds := 10000
    );
  end if;
  return new;
end;
$$;

create trigger trg_payments_notify_declared
  after update of verification_status on public.payments
  for each row execute function public.payments_notify_declared();

-- File de l'agent : paiements du circuit manuel avec commande et client
create or replace function public.payment_queue(p_status text default 'declared', p_limit int default 200)
returns table (
  id uuid, order_id uuid, reference text, method text, amount numeric, amount_received numeric, currency text,
  verification_status text, transaction_id text, sender_number text, proof_path text, reject_reason text,
  on_hold boolean, created_at timestamptz, declared_at timestamptz, validated_at timestamptz, expires_at timestamptz,
  buyer_name text, buyer_email text, buyer_phone text, shipping_country text, order_status text, shop_name text,
  review_count int
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.order_id, p.reference, p.payment_method_code, p.amount, p.amount_received, p.currency,
    p.verification_status, p.transaction_id, p.sender_number, p.proof_path, p.reject_reason,
    p.on_hold, p.created_at, p.declared_at, p.validated_at, p.expires_at,
    coalesce(nullif(trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), ''), u.full_name, o.shipping_name),
    u.email, coalesce(o.shipping_phone, u.phone), o.shipping_country, o.status,
    (select s.name from public.order_items oi join public.shops s on s.id = oi.shop_id where oi.order_id = o.id limit 1),
    (select count(*)::int from public.payment_reviews r where r.payment_id = p.id)
  from public.payments p
  left join public.orders o on o.id = p.order_id
  left join public.users u on u.id = p.user_id
  where public.is_payment_staff()
    and p.verification_status is not null
    and (p_status is null or p.verification_status = p_status
         or (p_status = 'rejected' and p.verification_status = 'awaiting_payment' and p.reject_reason is not null))
  order by coalesce(p.declared_at, p.created_at) asc
  limit p_limit
$$;
revoke all on function public.payment_queue(text, int) from public, anon;
grant execute on function public.payment_queue(text, int) to authenticated;

-- Historique d'un paiement pour la fiche agent
create or replace function public.payment_review_history(p_payment_id uuid)
returns table (action text, reason text, amount_received numeric, transaction_id text, created_at timestamptz, agent_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select r.action, r.reason, r.amount_received, r.transaction_id, r.created_at,
    coalesce(nullif(trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), ''), u.full_name, u.email)
  from public.payment_reviews r left join public.users u on u.id = r.agent_id
  where public.is_payment_staff() and r.payment_id = p_payment_id
  order by r.created_at desc
$$;
revoke all on function public.payment_review_history(uuid) from public, anon;
grant execute on function public.payment_review_history(uuid) to authenticated;

-- Clôture journalière (jour UTC) : par moyen et devise
create or replace function public.payment_daily_summary(p_day date default current_date)
returns table (method text, currency text, validated_count int, validated_total numeric,
               rejected_count int, declared_pending int, awaiting int)
language sql
stable
security definer
set search_path = ''
as $$
  with m as (
    select distinct payment_method_code as method, currency
    from public.payments where verification_status is not null
  )
  select m.method, m.currency,
    (select count(*)::int from public.payments p
      where p.payment_method_code = m.method and p.currency = m.currency and p.verification_status = 'validated'
        and p.validated_at >= p_day and p.validated_at < p_day + 1),
    (select coalesce(sum(coalesce(p.amount_received, p.amount)), 0) from public.payments p
      where p.payment_method_code = m.method and p.currency = m.currency and p.verification_status = 'validated'
        and p.validated_at >= p_day and p.validated_at < p_day + 1),
    (select count(*)::int from public.payment_reviews r join public.payments p on p.id = r.payment_id
      where r.action = 'reject' and p.payment_method_code = m.method and p.currency = m.currency
        and r.created_at >= p_day and r.created_at < p_day + 1),
    (select count(*)::int from public.payments p
      where p.payment_method_code = m.method and p.currency = m.currency and p.verification_status = 'declared'),
    (select count(*)::int from public.payments p
      where p.payment_method_code = m.method and p.currency = m.currency and p.verification_status = 'awaiting_payment')
  from m
  where public.is_payment_staff()
  order by 1, 2
$$;
revoke all on function public.payment_daily_summary(date) from public, anon;
grant execute on function public.payment_daily_summary(date) to authenticated;

-- ═════════════════ 9. Expiration (toutes les 15 min) ═════════════════
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
    where p.verification_status = 'awaiting_payment' and p.expires_at < now()
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

select cron.schedule('expire-manual-payments', '*/15 * * * *', 'select public.expire_manual_payments()');

-- L'ancien délai de 72 h des virements est remplacé par ce circuit
select cron.unschedule('expire-unpaid-bank-transfers');

-- ═════════════════ 10. Paiement à la livraison et virement ═════════════════
-- submit_checkout enregistre l'adresse ; le virement passe désormais par
-- create_manual_payment (référence WN-, déclaration, vérification).
-- Le paiement à la livraison ne change pas.
create or replace function public.submit_checkout(p_order_id uuid, p_name text, p_address text, p_city text, p_country text, p_notes text, p_method text)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  if v_order.quest_proposal_id is not null and p_method = 'cash_on_delivery' then
    raise exception 'cod_not_allowed_for_quest';
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

  if p_method = 'cash_on_delivery' then
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
      verification_status = null,
      metadata = coalesce(public.payments.metadata, '{}'::jsonb) || excluded.metadata,
      updated_at = now()
    where public.payments.status = 'pending' and public.payments.verification_status is distinct from 'declared';
  end if;

  return json_build_object('status', v_status, 'reference', v_ref);
end;
$function$;
