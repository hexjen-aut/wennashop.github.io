-- Comptabilité WennaShop : grand livre, reversements, dépenses, soldes et
-- compte de résultat. Retour arrière : supabase/rollbacks/20261014100000_accounting_down.sql
--
-- Principe : Wenna encaisse tout (en ligne et paiement à la livraison), garde
-- sa commission et sa marge de change, et doit le reste aux vendeurs et aux
-- chasseurs. Chaque mouvement d'argent est une ligne du grand livre, écrite
-- par les fonctions serveur ci-dessous et jamais modifiée ni supprimée.
--
-- Écritures automatiques, quand une commande est LIVRÉE et son paiement PAYÉ :
--   vente_encaissee   montant payé par l'acheteur (sa devise), chez « collected_by »
--   marge_change      part de marge de change incluse dans ce montant (si devises différentes)
--   commission_wenna  par ligne de commande (taux figé à la commande) ; quête : 10 % de la récompense
--   part_vendeur      par ligne : prix × quantité − commission (devise du vendeur)
--   part_chasseur     parrainage (hunter_earnings : part de commission, prime) ; quête : ce qui revient au chasseur
-- Annulation, retour ou remboursement après encaissement : écritures inverses
-- (montants négatifs, line_key « …:annulation ») et une ligne « remboursement ».
--
-- Signes : les montants sont positifs dans le sens du type (une sortie de caisse
-- est un reversement positif). Seuls les ajustements, les remises de fonds et
-- les écritures d'annulation peuvent être négatifs.
-- Pas de clé étrangère vers les commandes, boutiques ou utilisateurs : la
-- comptabilité doit survivre à leur suppression.

-- ═════════════════ 1. Grand livre ═════════════════
create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  entry_date date not null default current_date,
  type text not null check (type in (
    'vente_encaissee', 'commission_wenna', 'marge_change', 'part_vendeur', 'part_chasseur',
    'reversement_vendeur', 'paiement_chasseur', 'depense', 'remboursement', 'remise_fonds', 'ajustement')),
  source text not null default 'manual' check (source in (
    'sale', 'quest', 'referral', 'referral_bonus', 'payout', 'expense', 'manual')),
  order_id uuid,
  line_key text not null default '',
  shop_id uuid,
  hunter_id uuid,
  amount numeric(12,2) not null,
  currency text not null default 'MAD' check (currency ~ '^[A-Z]{3}$'),
  payment_method text check (payment_method in ('cod', 'virement', 'mobile_money', 'autre')),
  collected_by text,
  reference text,
  proof_url text,
  notes text,
  created_by uuid
);
comment on table public.ledger_entries is 'Grand livre WennaShop : une ligne par mouvement d''argent, immuable (corrections par ajustement).';

-- Idempotence : une commande ne produit qu'une fois chaque écriture (type + ligne)
create unique index ledger_entries_once on public.ledger_entries
  (coalesce(order_id, '00000000-0000-0000-0000-000000000000'::uuid), type, line_key)
  where line_key <> '';
create index ledger_entries_date on public.ledger_entries (entry_date);
create index ledger_entries_order on public.ledger_entries (order_id) where order_id is not null;
create index ledger_entries_shop on public.ledger_entries (shop_id) where shop_id is not null;
create index ledger_entries_hunter on public.ledger_entries (hunter_id) where hunter_id is not null;

create or replace function public.ledger_entries_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Écriture comptable immuable : corrige-la avec une écriture d''ajustement.' using errcode = '42501';
end;
$$;
create trigger trg_ledger_entries_immutable before update or delete on public.ledger_entries
  for each row execute function public.ledger_entries_immutable();
create trigger trg_ledger_entries_no_truncate before truncate on public.ledger_entries
  for each statement execute function public.ledger_entries_immutable();

alter table public.ledger_entries enable row level security;
create policy ledger_entries_select_admin on public.ledger_entries for select to authenticated
  using (public.get_my_role() = 'admin');
revoke insert, update, delete, truncate on public.ledger_entries from anon, authenticated;

-- ═════════════════ 2. Reversements vendeurs ═════════════════
create table public.vendor_payouts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  shop_id uuid not null,
  vendor_id uuid,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  period_start date,
  period_end date,
  amount_due numeric(12,2) not null,
  amount_paid numeric(12,2),
  paid_at timestamptz,
  method text check (method in ('cod', 'virement', 'mobile_money', 'autre')),
  reference text,
  collected_by text,
  proof_url text,
  status text not null default 'en_attente' check (status in ('en_attente', 'paye')),
  ledger_entry_id uuid,
  notes text,
  created_by uuid
);
create index vendor_payouts_shop on public.vendor_payouts (shop_id, status);
alter table public.vendor_payouts enable row level security;
create policy vendor_payouts_select on public.vendor_payouts for select to authenticated
  using (public.get_my_role() = 'admin' or public.can_manage_seller(vendor_id));
revoke insert, update, delete, truncate on public.vendor_payouts from anon, authenticated;

-- ═════════════════ 3. Dépenses ═════════════════
-- Modèle récurrent : is_recurring = true, template_id null (montant facultatif).
-- Dépense enregistrée : montant renseigné et écriture « depense » au grand livre.
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  expense_date date not null default current_date,
  supplier text not null,
  category text not null check (category in ('outils_ia', 'hebergement', 'livraison', 'marketing', 'autre')),
  amount numeric(12,2) check (amount is null or amount >= 0),
  currency text not null default 'MAD' check (currency ~ '^[A-Z]{3}$'),
  is_recurring boolean not null default false,
  recurrence text check (recurrence in ('mensuel', 'annuel')),
  template_id uuid references public.expenses(id) on delete set null,
  paid_by text,
  proof_path text,
  notes text,
  ledger_entry_id uuid,
  created_by uuid
);
create index expenses_date on public.expenses (expense_date);
alter table public.expenses enable row level security;
create policy expenses_select_admin on public.expenses for select to authenticated
  using (public.get_my_role() = 'admin');
-- L'admin gère les modèles récurrents ; une dépense passée au grand livre ne bouge plus
create policy expenses_write_templates on public.expenses for all to authenticated
  using (public.get_my_role() = 'admin' and ledger_entry_id is null)
  with check (public.get_my_role() = 'admin' and ledger_entry_id is null and template_id is null);

-- Justificatifs : bucket privé, admin uniquement
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('accounting-proofs', 'accounting-proofs', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;
create policy accounting_proofs_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'accounting-proofs' and public.get_my_role() = 'admin');
create policy accounting_proofs_admin_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'accounting-proofs' and public.get_my_role() = 'admin');

-- ═════════════════ 4. Écritures automatiques ═════════════════
create or replace function public.ledger_currency(p text)
returns text
language sql
immutable
set search_path = ''
as $$ select case when upper(coalesce(p, '')) = 'FCFA' then 'XAF' when coalesce(p, '') = '' then 'MAD' else upper(p) end $$;

-- FCFA sans décimales, autres devises au centime
create or replace function public.ledger_round(p_amount numeric, p_currency text)
returns numeric
language sql
immutable
set search_path = ''
as $$ select round(p_amount, case when public.ledger_currency(p_currency) in ('XAF', 'XOF') then 0 else 2 end) $$;

-- Qui détient l'argent d'un paiement (compte de réception ou personne qui a encaissé)
create or replace function public.ledger_holder(p_method text, p_provider text, p_metadata jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_method = 'cash_on_delivery' then coalesce(nullif(p_metadata->>'collected_by', ''), 'Livreur')
    when p_provider = 'singpay' then 'SingPay'
    when p_provider = 'pawapay' then 'pawaPay'
    when p_provider = 'airtel' then 'Airtel Money (API)'
    when p_method = 'airtel_money' then 'Compte Airtel Wenna'
    when p_method = 'moov_money' then 'Compte Moov Wenna'
    when p_method = 'virement' then 'Compte bancaire Maroc'
    else 'Autre'
  end
$$;

create or replace function public.ledger_method(p_method text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_method when 'cash_on_delivery' then 'cod' when 'virement' then 'virement'
    when 'airtel_money' then 'mobile_money' when 'moov_money' then 'mobile_money' else 'autre' end
$$;

-- Passe les écritures d'une commande livrée et payée. Idempotent : peut être
-- appelée autant de fois que voulu, chaque écriture n'existe qu'une fois.
create or replace function public.post_order_ledger(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
  p record;
  it record;
  e record;
  q record;
  v_cur text;
  v_buyer_cur text;
  v_cash numeric;
  v_holder text;
  v_pm text;
  v_shop uuid;
  v_margin numeric;
  v_comm numeric;
  v_n integer := 0;
  v_rows integer;
begin
  select * into o from public.orders where id = p_order_id;
  if not found or o.status <> 'delivered' then return 0; end if;
  select * into p from public.payments
  where order_id = o.id and type = 'order_payment' and status = 'paid'
  order by updated_at desc nulls last limit 1;
  if not found then return 0; end if;

  v_cur := public.ledger_currency(o.currency);
  v_buyer_cur := public.ledger_currency(coalesce(p.currency, o.buyer_currency, o.currency));
  v_cash := coalesce(p.amount, o.buyer_total_amount, o.total_amount);
  v_holder := public.ledger_holder(p.method, p.provider, p.metadata);
  v_pm := public.ledger_method(p.method);
  select shop_id into v_shop from public.order_items where order_id = o.id limit 1;

  -- Encaissement
  insert into public.ledger_entries (type, source, order_id, line_key, shop_id, amount, currency, payment_method, collected_by, reference, notes)
  values ('vente_encaissee', case when o.quest_proposal_id is null then 'sale' else 'quest' end, o.id, 'order', v_shop,
    public.ledger_round(v_cash, v_buyer_cur), v_buyer_cur, v_pm, v_holder,
    coalesce(p.reference, p.transaction_id, p.metadata->>'reference'),
    case when p.amount_received > p.amount then 'Reçu ' || p.amount_received || ' ' || v_buyer_cur || ' (trop-perçu à rembourser)' end)
  on conflict do nothing;
  get diagnostics v_rows = row_count; v_n := v_n + v_rows;

  -- Marge de change incluse dans le montant payé (convert_amount : × (1 + marge))
  if v_buyer_cur <> v_cur then
    select safety_margin_percent into v_margin from public.exchange_rates
    where base_currency = v_cur and quote_currency = v_buyer_cur;
    if coalesce(v_margin, 0) > 0 then
      insert into public.ledger_entries (type, source, order_id, line_key, shop_id, amount, currency, collected_by)
      values ('marge_change', case when o.quest_proposal_id is null then 'sale' else 'quest' end, o.id, 'order', v_shop,
        public.ledger_round(v_cash * v_margin / (100 + v_margin), v_buyer_cur), v_buyer_cur, v_holder)
      on conflict do nothing;
      get diagnostics v_rows = row_count; v_n := v_n + v_rows;
    end if;
  end if;

  if o.quest_proposal_id is null then
    -- Vente : commission et part vendeur par ligne
    for it in select * from public.order_items where order_id = o.id loop
      insert into public.ledger_entries (type, source, order_id, line_key, shop_id, amount, currency, notes)
      values ('commission_wenna', 'sale', o.id, it.id::text, it.shop_id,
        public.ledger_round(coalesce(it.commission_amount, 0), v_cur), v_cur,
        'Taux ' || coalesce(it.commission_rate, 0) || ' %')
      on conflict do nothing;
      get diagnostics v_rows = row_count; v_n := v_n + v_rows;
      insert into public.ledger_entries (type, source, order_id, line_key, shop_id, amount, currency)
      values ('part_vendeur', 'sale', o.id, it.id::text, it.shop_id,
        public.ledger_round(it.unit_price * it.quantity - coalesce(it.commission_amount, 0), v_cur), v_cur)
      on conflict do nothing;
      get diagnostics v_rows = row_count; v_n := v_n + v_rows;
    end loop;

    -- Parrainage : gains du chasseur (part de commission, prime d'activation)
    for e in select * from public.hunter_earnings where order_id = o.id and status <> 'cancelled' loop
      insert into public.ledger_entries (type, source, order_id, line_key, shop_id, hunter_id, amount, currency, notes)
      values ('part_chasseur', case when e.type = 'activation_bonus' then 'referral_bonus' else 'referral' end,
        o.id, e.id::text, e.shop_id, e.hunter_id, public.ledger_round(e.amount, e.currency), public.ledger_currency(e.currency),
        case when e.type = 'activation_bonus' then 'Prime d''activation' else 'Part de commission (parrainage)' end)
      on conflict do nothing;
      get diagnostics v_rows = row_count; v_n := v_n + v_rows;
    end loop;
  else
    -- Quête : Wenna garde 10 % (réglable) de la récompense, le reste revient au chasseur
    select qp.hunter_id, coalesce(qu.reward_amount, 0) as reward into q
    from public.quest_proposals qp join public.quests qu on qu.id = qp.quest_id
    where qp.id = o.quest_proposal_id;
    if found then
      v_comm := public.ledger_round(q.reward * public.cfg_num('quest_commission_pct', 10) / 100, v_cur);
      insert into public.ledger_entries (type, source, order_id, line_key, hunter_id, amount, currency, notes)
      values ('commission_wenna', 'quest', o.id, 'quest', q.hunter_id, v_comm, v_cur,
        public.cfg_num('quest_commission_pct', 10) || ' % de la récompense')
      on conflict do nothing;
      get diagnostics v_rows = row_count; v_n := v_n + v_rows;
      insert into public.ledger_entries (type, source, order_id, line_key, hunter_id, amount, currency, notes)
      values ('part_chasseur', 'quest', o.id, 'quest', q.hunter_id,
        public.ledger_round(o.total_amount - v_comm, v_cur), v_cur, 'Produit + transport + récompense − commission')
      on conflict do nothing;
      get diagnostics v_rows = row_count; v_n := v_n + v_rows;
    end if;
  end if;

  return v_n;
end;
$$;
revoke all on function public.post_order_ledger(uuid) from public, anon, authenticated;

-- Annulation / retour / remboursement d'une commande déjà passée au grand livre
create or replace function public.reverse_order_ledger(p_order_id uuid, p_reason text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale record;
  e record;
  v_n integer := 0;
  v_rows integer;
begin
  select * into v_sale from public.ledger_entries
  where order_id = p_order_id and type = 'vente_encaissee' and line_key = 'order';
  if not found then return 0; end if;

  for e in select * from public.ledger_entries
    where order_id = p_order_id
      and type in ('commission_wenna', 'marge_change', 'part_vendeur', 'part_chasseur')
      and line_key not like '%:annulation'
      and source <> 'referral_bonus'   -- la prime d'activation reste acquise
  loop
    insert into public.ledger_entries (type, source, order_id, line_key, shop_id, hunter_id, amount, currency, collected_by, notes)
    values (e.type, e.source, e.order_id, e.line_key || ':annulation', e.shop_id, e.hunter_id, -e.amount, e.currency, e.collected_by,
      'Annulation' || coalesce(' : ' || p_reason, ''))
    on conflict do nothing;
    get diagnostics v_rows = row_count; v_n := v_n + v_rows;
  end loop;

  insert into public.ledger_entries (type, source, order_id, line_key, shop_id, amount, currency, payment_method, collected_by, notes)
  values ('remboursement', v_sale.source, p_order_id, 'order', v_sale.shop_id, v_sale.amount, v_sale.currency,
    v_sale.payment_method, v_sale.collected_by, 'Remboursement à l''acheteur' || coalesce(' : ' || p_reason, ''))
  on conflict do nothing;
  get diagnostics v_rows = row_count; v_n := v_n + v_rows;
  return v_n;
end;
$$;
revoke all on function public.reverse_order_ledger(uuid, text) from public, anon, authenticated;

create or replace function public.orders_ledger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is not distinct from old.status then return new; end if;
  -- Une erreur comptable ne bloque jamais la commande : elle est notée dans
  -- system_logs (source « compta ») et l'écriture peut être rejouée.
  begin
    if new.status = 'delivered' then
      perform public.post_order_ledger(new.id);
    elsif new.status in ('cancelled', 'returned') then
      perform public.reverse_order_ledger(new.id, case new.status when 'returned' then 'commande retournée' else 'commande annulée' end);
    end if;
  exception when others then
    insert into public.system_logs (source, level, message, metadata)
    values ('compta', 'error', 'Écriture comptable impossible : ' || sqlerrm, jsonb_build_object('order_id', new.id, 'status', new.status));
  end;
  return new;
end;
$$;
-- Nommé après trg_orders_hunter_earnings : les gains de parrainage existent déjà
create trigger trg_orders_ledger after update of status on public.orders
  for each row execute function public.orders_ledger();

create or replace function public.payments_ledger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type <> 'order_payment' or new.order_id is null or new.status is not distinct from old.status then return new; end if;
  begin
    if new.status = 'paid' then
      perform public.post_order_ledger(new.order_id);
    elsif new.status = 'refunded' then
      perform public.reverse_order_ledger(new.order_id, 'paiement remboursé');
    end if;
  exception when others then
    insert into public.system_logs (source, level, message, metadata)
    values ('compta', 'error', 'Écriture comptable impossible : ' || sqlerrm, jsonb_build_object('order_id', new.order_id, 'payment_id', new.id));
  end;
  return new;
end;
$$;
create trigger trg_payments_ledger after update of status on public.payments
  for each row execute function public.payments_ledger();
revoke all on function public.orders_ledger() from public, anon, authenticated;
revoke all on function public.payments_ledger() from public, anon, authenticated;

-- ═════════════════ 5. Actions de l'admin ═════════════════
-- Paiement à la livraison : Wenna a récupéré les espèces (livreur local,
-- Ozone, Achille…). Les frais de livraison retenus par ce détenteur sont
-- enregistrés en dépense « livraison », payée par lui.
create or replace function public.confirm_cod_collected(
  p_order_id uuid, p_collected_by text, p_reference text default null, p_delivery_fee numeric default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_currency text;
  v_holder text := trim(coalesce(p_collected_by, ''));
begin
  if public.get_my_role() is distinct from 'admin' then raise exception 'forbidden'; end if;
  if v_holder = '' then raise exception 'collected_by_required'; end if;
  if p_delivery_fee is not null and p_delivery_fee < 0 then raise exception 'invalid_amount'; end if;
  select status into v_status from public.orders where id = p_order_id;
  if v_status is null then raise exception 'order_not_found'; end if;
  if v_status not in ('shipped', 'delivered') then raise exception 'order_not_delivered'; end if;
  update public.payments set
    status = 'paid', updated_at = now(),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'collected_by', v_holder, 'collected_at', now(), 'confirmed_by', public.my_user_id(),
      'reference', coalesce(nullif(trim(coalesce(p_reference, '')), ''), metadata->>'reference'))
  where order_id = p_order_id and type = 'order_payment' and method = 'cash_on_delivery' and status = 'pending'
  returning currency into v_currency;
  if not found then raise exception 'no_pending_cod'; end if;

  if coalesce(p_delivery_fee, 0) > 0 then
    perform public.record_expense(v_holder, 'livraison', p_delivery_fee, v_currency, current_date, v_holder, null,
      'Livraison commande ' || upper(left(p_order_id::text, 8)));
  end if;
  return json_build_object('status', 'paid');
end;
$$;
revoke all on function public.confirm_cod_collected(uuid, text, text, numeric) from public, anon;
grant execute on function public.confirm_cod_collected(uuid, text, text, numeric) to authenticated;

-- Reversement à un vendeur : crée l'écriture et la ligne de reversement
create or replace function public.pay_vendor(
  p_shop_id uuid, p_currency text, p_amount numeric, p_method text, p_reference text,
  p_collected_by text, p_proof_url text default null, p_payout_id uuid default null, p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cur text := public.ledger_currency(p_currency);
  v_vendor uuid;
  v_entry uuid;
  v_payout uuid := p_payout_id;
  v_due numeric;
begin
  if public.get_my_role() is distinct from 'admin' then raise exception 'forbidden'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'invalid_amount'; end if;
  if coalesce(trim(p_reference), '') = '' then raise exception 'reference_required'; end if;
  select user_id into v_vendor from public.shops where id = p_shop_id;
  select coalesce(balance, 0) into v_due from public.v_vendor_balances where shop_id = p_shop_id and currency = v_cur;

  insert into public.ledger_entries (type, source, shop_id, amount, currency, payment_method, collected_by, reference, proof_url, notes, created_by, line_key)
  values ('reversement_vendeur', 'payout', p_shop_id, public.ledger_round(p_amount, v_cur), v_cur, p_method,
    nullif(trim(coalesce(p_collected_by, '')), ''), trim(p_reference), p_proof_url, p_notes, public.my_user_id(), gen_random_uuid()::text)
  returning id into v_entry;

  if v_payout is not null then
    update public.vendor_payouts set status = 'paye', amount_paid = public.ledger_round(p_amount, v_cur), paid_at = now(),
      method = p_method, reference = trim(p_reference), collected_by = p_collected_by, proof_url = p_proof_url, ledger_entry_id = v_entry
    where id = v_payout and shop_id = p_shop_id and status = 'en_attente';
    if not found then raise exception 'payout_not_pending'; end if;
  else
    insert into public.vendor_payouts (shop_id, vendor_id, currency, period_end, amount_due, amount_paid, paid_at, method, reference,
      collected_by, proof_url, status, ledger_entry_id, notes, created_by)
    values (p_shop_id, v_vendor, v_cur, current_date, coalesce(v_due, p_amount), public.ledger_round(p_amount, v_cur), now(), p_method,
      trim(p_reference), p_collected_by, p_proof_url, 'paye', v_entry, p_notes, public.my_user_id())
    returning id into v_payout;
  end if;

  if v_vendor is not null then
    insert into public.notifications (user_id, type, title, body, link)
    values (v_vendor, 'money', 'Reversement envoyé',
      'WennaShop t''a reversé ' || public.ledger_round(p_amount, v_cur) || ' ' || case when v_cur in ('XAF', 'XOF') then 'FCFA' else v_cur end
        || ' (référence ' || trim(p_reference) || ').', '/vendeur');
  end if;
  return v_payout;
end;
$$;
revoke all on function public.pay_vendor(uuid, text, numeric, text, text, text, text, uuid, text) from public, anon;
grant execute on function public.pay_vendor(uuid, text, numeric, text, text, text, text, uuid, text) to authenticated;

-- Prépare les reversements « en attente » de tous les vendeurs à qui Wenna doit de l'argent
create or replace function public.prepare_vendor_payouts(p_period_end date default current_date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_n integer;
begin
  if public.get_my_role() is distinct from 'admin' then raise exception 'forbidden'; end if;
  insert into public.vendor_payouts (shop_id, vendor_id, currency, period_start, period_end, amount_due, status, created_by)
  select b.shop_id, b.vendor_id, b.currency,
    coalesce((select max(vp.period_end) + 1 from public.vendor_payouts vp where vp.shop_id = b.shop_id and vp.currency = b.currency and vp.status = 'paye'),
             b.first_entry),
    p_period_end, b.balance, 'en_attente', public.my_user_id()
  from public.v_vendor_balances b
  where b.balance > 0
    and not exists (select 1 from public.vendor_payouts vp where vp.shop_id = b.shop_id and vp.currency = b.currency and vp.status = 'en_attente');
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.prepare_vendor_payouts(date) from public, anon;
grant execute on function public.prepare_vendor_payouts(date) to authenticated;

-- Paiement d'un chasseur (parrainage et/ou quêtes)
create or replace function public.pay_hunter(
  p_hunter_id uuid, p_currency text, p_amount numeric, p_method text, p_reference text,
  p_collected_by text, p_proof_url text default null, p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cur text := public.ledger_currency(p_currency);
  v_entry uuid;
  v_left numeric := p_amount;
  e record;
begin
  if public.get_my_role() is distinct from 'admin' then raise exception 'forbidden'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'invalid_amount'; end if;
  if coalesce(trim(p_reference), '') = '' then raise exception 'reference_required'; end if;
  insert into public.ledger_entries (type, source, hunter_id, amount, currency, payment_method, collected_by, reference, proof_url, notes, created_by, line_key)
  values ('paiement_chasseur', 'payout', p_hunter_id, public.ledger_round(p_amount, v_cur), v_cur, p_method,
    nullif(trim(coalesce(p_collected_by, '')), ''), trim(p_reference), p_proof_url, p_notes, public.my_user_id(), gen_random_uuid()::text)
  returning id into v_entry;

  -- Gains de parrainage disponibles marqués payés, du plus ancien au plus récent, dans la limite du montant
  for e in select id, amount from public.hunter_earnings
    where hunter_id = p_hunter_id and status = 'pending' and public.ledger_currency(currency) = v_cur and available_at <= now()
    order by available_at loop
    exit when e.amount > v_left;
    update public.hunter_earnings set status = 'paid', updated_at = now() where id = e.id;
    v_left := v_left - e.amount;
  end loop;

  insert into public.notifications (user_id, type, title, body, link)
  values (p_hunter_id, 'money', 'Paiement envoyé',
    'WennaShop t''a versé ' || public.ledger_round(p_amount, v_cur) || ' ' || case when v_cur in ('XAF', 'XOF') then 'FCFA' else v_cur end
      || ' (référence ' || trim(p_reference) || ').', '/chasseur');
  return v_entry;
end;
$$;
revoke all on function public.pay_hunter(uuid, text, numeric, text, text, text, text, text) from public, anon;
grant execute on function public.pay_hunter(uuid, text, numeric, text, text, text, text, text) to authenticated;

-- Dépense : enregistrée et passée au grand livre (éventuellement depuis un modèle récurrent)
create or replace function public.record_expense(
  p_supplier text, p_category text, p_amount numeric, p_currency text, p_date date,
  p_paid_by text, p_proof_path text default null, p_notes text default null, p_template_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cur text := public.ledger_currency(p_currency);
  v_tpl record;
  v_expense uuid;
  v_entry uuid;
  v_supplier text := trim(coalesce(p_supplier, ''));
  v_category text := p_category;
begin
  if public.get_my_role() is distinct from 'admin' then raise exception 'forbidden'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'invalid_amount'; end if;
  if p_template_id is not null then
    select * into v_tpl from public.expenses where id = p_template_id and is_recurring and template_id is null;
    if not found then raise exception 'template_not_found'; end if;
    v_supplier := coalesce(nullif(v_supplier, ''), v_tpl.supplier);
    v_category := coalesce(v_category, v_tpl.category);
  end if;
  if v_supplier = '' then raise exception 'supplier_required'; end if;

  insert into public.expenses (expense_date, supplier, category, amount, currency, is_recurring, template_id, paid_by, proof_path, notes, created_by)
  values (coalesce(p_date, current_date), v_supplier, v_category, public.ledger_round(p_amount, v_cur), v_cur,
    p_template_id is not null, p_template_id, nullif(trim(coalesce(p_paid_by, '')), ''), p_proof_path, p_notes, public.my_user_id())
  returning id into v_expense;

  insert into public.ledger_entries (type, source, entry_date, line_key, amount, currency, payment_method, collected_by, reference, proof_url, notes, created_by)
  values ('depense', 'expense', coalesce(p_date, current_date), v_expense::text, public.ledger_round(p_amount, v_cur), v_cur, 'autre',
    nullif(trim(coalesce(p_paid_by, '')), ''), v_supplier, p_proof_path, coalesce(p_notes, v_category), public.my_user_id())
  returning id into v_entry;

  update public.expenses set ledger_entry_id = v_entry where id = v_expense;
  return v_expense;
end;
$$;
revoke all on function public.record_expense(text, text, numeric, text, date, text, text, text, uuid) from public, anon;
grant execute on function public.record_expense(text, text, numeric, text, date, text, text, text, uuid) to authenticated;

-- Écriture manuelle : ajustement (correction) ou remise de fonds entre détenteurs
create or replace function public.add_ledger_adjustment(
  p_amount numeric, p_currency text, p_notes text, p_date date default current_date,
  p_shop_id uuid default null, p_hunter_id uuid default null, p_collected_by text default null, p_reference text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if public.get_my_role() is distinct from 'admin' then raise exception 'forbidden'; end if;
  if coalesce(p_amount, 0) = 0 then raise exception 'invalid_amount'; end if;
  if coalesce(trim(p_notes), '') = '' then raise exception 'notes_required'; end if;
  insert into public.ledger_entries (type, source, entry_date, shop_id, hunter_id, amount, currency, collected_by, reference, notes, created_by)
  values ('ajustement', 'manual', coalesce(p_date, current_date), p_shop_id, p_hunter_id,
    public.ledger_round(p_amount, p_currency), public.ledger_currency(p_currency),
    nullif(trim(coalesce(p_collected_by, '')), ''), p_reference, trim(p_notes), public.my_user_id())
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.add_ledger_adjustment(numeric, text, text, date, uuid, uuid, text, text) from public, anon;
grant execute on function public.add_ledger_adjustment(numeric, text, text, date, uuid, uuid, text, text) to authenticated;

create or replace function public.transfer_funds(p_from text, p_to text, p_amount numeric, p_currency text, p_reference text default null, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_key text := gen_random_uuid()::text;
begin
  if public.get_my_role() is distinct from 'admin' then raise exception 'forbidden'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'invalid_amount'; end if;
  if coalesce(trim(p_from), '') = '' or coalesce(trim(p_to), '') = '' or trim(p_from) = trim(p_to) then raise exception 'invalid_holders'; end if;
  insert into public.ledger_entries (type, source, line_key, amount, currency, collected_by, reference, notes, created_by)
  values
    ('remise_fonds', 'manual', v_key || ':depart', -public.ledger_round(p_amount, p_currency), public.ledger_currency(p_currency), trim(p_from), p_reference,
     coalesce(p_notes, 'Remis à ' || trim(p_to)), public.my_user_id()),
    ('remise_fonds', 'manual', v_key || ':arrivee', public.ledger_round(p_amount, p_currency), public.ledger_currency(p_currency), trim(p_to), p_reference,
     coalesce(p_notes, 'Reçu de ' || trim(p_from)), public.my_user_id());
end;
$$;
revoke all on function public.transfer_funds(text, text, numeric, text, text, text) from public, anon;
grant execute on function public.transfer_funds(text, text, numeric, text, text, text) to authenticated;

-- ═════════════════ 6. Vues (droits de l'appelant : admin uniquement) ═════════════════
create view public.v_vendor_balances with (security_invoker = true) as
select l.shop_id, s.name as shop_name, s.user_id as vendor_id, l.currency,
  coalesce(sum(l.amount) filter (where l.type = 'part_vendeur'), 0) as due,
  coalesce(sum(l.amount) filter (where l.type = 'reversement_vendeur'), 0) as paid,
  coalesce(sum(l.amount) filter (where l.type = 'ajustement'), 0) as adjustments,
  coalesce(sum(l.amount) filter (where l.type = 'part_vendeur'), 0)
    - coalesce(sum(l.amount) filter (where l.type = 'reversement_vendeur'), 0)
    + coalesce(sum(l.amount) filter (where l.type = 'ajustement'), 0) as balance,
  min(l.entry_date) as first_entry,
  max(l.entry_date) as last_entry
from public.ledger_entries l
left join public.shops s on s.id = l.shop_id
where l.shop_id is not null and l.type in ('part_vendeur', 'reversement_vendeur', 'ajustement')
group by l.shop_id, s.name, s.user_id, l.currency;

create view public.v_hunter_balances with (security_invoker = true) as
select l.hunter_id,
  coalesce(nullif(trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), ''), u.full_name, u.email) as hunter_name,
  l.currency,
  coalesce(sum(l.amount) filter (where l.type = 'part_chasseur'), 0) as due,
  coalesce(sum(l.amount) filter (where l.type = 'paiement_chasseur'), 0) as paid,
  coalesce(sum(l.amount) filter (where l.type = 'ajustement'), 0) as adjustments,
  coalesce(sum(l.amount) filter (where l.type = 'part_chasseur'), 0)
    - coalesce(sum(l.amount) filter (where l.type = 'paiement_chasseur'), 0)
    + coalesce(sum(l.amount) filter (where l.type = 'ajustement'), 0) as balance,
  -- Disponible : parts de quête tout de suite, parrainage après le délai de blocage
  coalesce(sum(l.amount) filter (where l.type = 'part_chasseur'
      and (l.source = 'quest' or l.created_at <= now() - make_interval(days => public.cfg_num('hunter_hold_days', 7)::int))), 0)
    - coalesce(sum(l.amount) filter (where l.type = 'paiement_chasseur'), 0)
    + coalesce(sum(l.amount) filter (where l.type = 'ajustement'), 0) as available
from public.ledger_entries l
left join public.users u on u.id = l.hunter_id
where l.hunter_id is not null and l.type in ('part_chasseur', 'paiement_chasseur', 'ajustement')
group by l.hunter_id, u.first_name, u.last_name, u.full_name, u.email, l.currency;

-- Compte de résultat mensuel, par devise. Revenu de Wenna = commissions + marge
-- de change ; le volume des ventes (GMV) est affiché à part.
create view public.v_monthly_pnl with (security_invoker = true) as
select date_trunc('month', l.entry_date)::date as month, l.currency,
  coalesce(sum(l.amount) filter (where l.type = 'commission_wenna'), 0) as commissions,
  coalesce(sum(l.amount) filter (where l.type = 'marge_change'), 0) as fx_margin,
  coalesce(sum(l.amount) filter (where l.type in ('commission_wenna', 'marge_change')), 0) as revenue,
  coalesce(sum(l.amount) filter (where l.type = 'part_chasseur' and l.source in ('referral', 'referral_bonus')), 0) as referral_costs,
  coalesce(sum(l.amount) filter (where l.type = 'depense'), 0) as expenses,
  coalesce(sum(l.amount) filter (where l.type = 'ajustement' and l.shop_id is null and l.hunter_id is null and l.collected_by is null), 0) as adjustments,
  coalesce(sum(l.amount) filter (where l.type in ('commission_wenna', 'marge_change')), 0)
    - coalesce(sum(l.amount) filter (where l.type = 'part_chasseur' and l.source in ('referral', 'referral_bonus')), 0)
    - coalesce(sum(l.amount) filter (where l.type = 'depense'), 0)
    + coalesce(sum(l.amount) filter (where l.type = 'ajustement' and l.shop_id is null and l.hunter_id is null and l.collected_by is null), 0) as net_margin,
  coalesce(sum(l.amount) filter (where l.type = 'vente_encaissee'), 0) as gmv,
  coalesce(sum(l.amount) filter (where l.type = 'remboursement'), 0) as refunds,
  count(distinct l.order_id) filter (where l.type = 'vente_encaissee') as orders_count
from public.ledger_entries l
group by 1, 2;

-- Argent détenu par chaque détenteur (livreur, Achille, comptes de réception…)
create view public.v_cash_position with (security_invoker = true) as
select l.collected_by, l.currency,
  sum(case l.type
    when 'vente_encaissee' then l.amount
    when 'remise_fonds' then l.amount
    when 'ajustement' then l.amount
    when 'remboursement' then -l.amount
    when 'reversement_vendeur' then -l.amount
    when 'paiement_chasseur' then -l.amount
    when 'depense' then -l.amount
    else 0 end) as balance,
  max(l.entry_date) as last_movement
from public.ledger_entries l
where l.collected_by is not null
  and l.type in ('vente_encaissee', 'remise_fonds', 'ajustement', 'remboursement', 'reversement_vendeur', 'paiement_chasseur', 'depense')
group by l.collected_by, l.currency;

-- ═════════════════ 7. Ce que voient vendeurs et chasseurs ═════════════════
create or replace function public.my_vendor_balance()
returns table (shop_id uuid, shop_name text, currency text, due numeric, paid numeric, balance numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select b.shop_id, b.shop_name, b.currency, b.due, b.paid, b.balance
  from public.v_vendor_balances b
  where public.can_manage_seller(b.vendor_id)
$$;
revoke all on function public.my_vendor_balance() from public, anon;
grant execute on function public.my_vendor_balance() to authenticated;

create or replace function public.my_hunter_balance()
returns table (currency text, due numeric, paid numeric, balance numeric, available numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select b.currency, b.due, b.paid, b.balance, b.available
  from public.v_hunter_balances b
  where b.hunter_id = public.my_user_id()
$$;
revoke all on function public.my_hunter_balance() from public, anon;
grant execute on function public.my_hunter_balance() to authenticated;

-- ═════════════════ 8. Réglage et données initiales ═════════════════
insert into public.site_config (key, value, updated_at) values ('quest_commission_pct', '10', now())
on conflict (key) do nothing;

insert into public.expenses (supplier, category, amount, currency, is_recurring, recurrence, notes)
values
  ('Claude (Anthropic)', 'outils_ia', null, 'USD', true, 'mensuel', 'Montant à compléter'),
  ('Supabase', 'hebergement', null, 'USD', true, 'mensuel', 'Montant à compléter');

-- Commandes déjà livrées et payées avant ce module
select public.post_order_ledger(o.id) from public.orders o where o.status = 'delivered';
