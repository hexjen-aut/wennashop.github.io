-- Quêtes : récompense minimum, avance sur ticket de caisse, remise au transport.
-- Retour arrière : supabase/rollbacks/20261015100000_quest_advance_down.sql
--
-- 1. Récompense minimum : 10 % du prix (budget à la publication, prix de
--    l'offre au paiement), avec un plancher de 1 000 FCFA ou 20 MAD. Si l'offre
--    choisie est plus chère que le budget, la récompense est relevée au paiement.
-- 2. Avance : un chasseur qui a déjà 5 quêtes livrées envoie le ticket de caisse
--    et une photo du produit avec le code de la quête. Un agent valide : le prix
--    du produit lui revient tout de suite (le plus petit entre le ticket et
--    l'offre). Plafond : 150 000 FCFA d'avances en cours par chasseur, toutes
--    quêtes confondues. La récompense reste bloquée jusqu'à la livraison.
-- 3. Le chasseur remet le colis au transport sous 72 h après l'avance, sinon
--    l'équipe est prévenue.
-- 4. Le ticket fait foi : si le ticket est plus bas que l'offre, l'écart est
--    rendu à l'acheteur à la livraison (écriture « remboursement » ecart_ticket).
-- Sans ticket validé, rien ne change : tout est versé à la livraison.

-- ═════════════════ 1. Réglages ═════════════════
insert into public.site_config (key, value, updated_at) values
  ('quest_reward_min_pct', '10', now()),
  ('quest_reward_floor_xaf', '1000', now()),
  ('quest_reward_floor_mad', '20', now()),
  ('quest_advance_min_quests', '5', now()),
  ('quest_advance_cap_xaf', '150000', now()),
  ('quest_handover_hours', '72', now())
on conflict (key) do nothing;

-- ═════════════════ 2. Récompense minimum ═════════════════
create or replace function public.quest_min_reward(p_base numeric, p_currency text)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cur text := public.ledger_currency(p_currency);
  v_floor numeric;
begin
  v_floor := case
    when v_cur in ('XAF', 'XOF') then public.cfg_num('quest_reward_floor_xaf', 1000)
    when v_cur = 'MAD' then public.cfg_num('quest_reward_floor_mad', 20)
    else coalesce(public.convert_amount(public.cfg_num('quest_reward_floor_xaf', 1000), 'XAF', v_cur), 0)
  end;
  return greatest(v_floor, ceil(greatest(coalesce(p_base, 0), 0) * public.cfg_num('quest_reward_min_pct', 10) / 100));
end;
$$;
grant execute on function public.quest_min_reward(numeric, text) to anon, authenticated;

-- À la publication (et si l'acheteur change le budget ou la récompense).
-- SECURITY INVOKER : les fonctions serveur et l'admin ne sont pas concernés.
create or replace function public.quests_enforce_min_reward()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_min numeric;
begin
  if current_user not in ('authenticated', 'anon') or public.get_my_role() = 'admin' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.reward_amount is not distinct from old.reward_amount
     and new.product_budget is not distinct from old.product_budget then
    return new;
  end if;
  v_min := public.quest_min_reward(new.product_budget, new.currency);
  if coalesce(new.reward_amount, 0) < v_min then
    raise exception 'reward_too_low' using errcode = '22023',
      detail = 'Récompense minimum : ' || v_min || ' ' || coalesce(new.currency, '');
  end if;
  return new;
end;
$$;

create trigger quests_enforce_min_reward
  before insert or update of reward_amount, product_budget on public.quests
  for each row execute function public.quests_enforce_min_reward();

-- Au paiement : récompense relevée à 10 % du prix de l'offre si besoin
create or replace function public.start_quest_checkout(p_proposal_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.my_user_id();
  v_prop record;
  v_quest record;
  v_cur text;
  v_reward numeric;
  v_total numeric;
  v_buyer_cur text;
  v_buyer_total numeric;
  v_existing record;
  v_order uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  select * into v_prop from public.quest_proposals where id = p_proposal_id;
  if not found then raise exception 'proposal_not_found'; end if;

  select * into v_quest from public.quests where id = v_prop.quest_id for update;
  if not found or v_quest.buyer_id is distinct from v_me then raise exception 'proposal_not_found'; end if;
  if v_quest.status <> 'open' then raise exception 'quest_not_open'; end if;
  if v_prop.status <> 'pending' then raise exception 'proposal_not_available'; end if;
  if v_prop.shipping_cost is null then raise exception 'shipping_not_quoted'; end if;
  if coalesce(v_prop.proposed_price, 0) <= 0 then raise exception 'invalid_price'; end if;

  v_cur := case when upper(v_quest.currency) = 'FCFA' then 'XAF' else upper(v_quest.currency) end;
  v_reward := greatest(coalesce(v_quest.reward_amount, 0), public.quest_min_reward(v_prop.proposed_price, v_quest.currency));
  v_total := v_prop.proposed_price + v_prop.shipping_cost + v_reward;

  -- Facturé dans la devise du pays de livraison (le mobile money n'accepte que le FCFA)
  v_buyer_cur := case when lower(coalesce(v_quest.destination_country, '')) = 'maroc' then 'MAD' else 'XAF' end;
  v_buyer_total := public.convert_amount(v_total, v_cur, v_buyer_cur);
  if v_buyer_total is null then
    v_buyer_cur := v_cur;
    v_buyer_total := v_total;
  end if;

  select id, quest_proposal_id, total_amount into v_existing
  from public.orders where quest_id = v_quest.id and status = 'pending' for update;
  if found then
    if v_existing.quest_proposal_id = p_proposal_id and v_existing.total_amount = v_total then
      return v_existing.id;
    end if;
    -- Autre offre (ou montant changé) : l'ancienne commande non payée est annulée
    update public.orders set status = 'cancelled', updated_at = now() where id = v_existing.id;
  end if;

  insert into public.orders (
    user_id, status, total_amount, subtotal, currency, buyer_total_amount, buyer_currency,
    shipping_country, quest_id, quest_proposal_id
  ) values (
    v_me, 'pending', v_total, v_prop.proposed_price, v_cur, v_buyer_total, v_buyer_cur,
    v_quest.destination_country, v_quest.id, p_proposal_id
  ) returning id into v_order;

  return v_order;
end;
$$;

revoke all on function public.start_quest_checkout(uuid) from public, anon;
grant execute on function public.start_quest_checkout(uuid) to authenticated;

-- Paiement confirmé : la récompense enregistrée sur la quête devient celle
-- réellement payée (la commission de 10 % se calcule dessus).
create or replace function public.orders_quest_paid()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_paid_reward numeric;
begin
  if new.quest_proposal_id is null or old.status <> 'pending' or new.status <> 'processing' then
    return new;
  end if;

  update public.quest_proposals set status = 'selected', selected_at = now()
  where id = new.quest_proposal_id and status = 'pending';

  update public.quest_proposals set status = 'rejected'
  where quest_id = new.quest_id and id <> new.quest_proposal_id and status = 'pending';

  select new.total_amount - qp.proposed_price - coalesce(qp.shipping_cost, 0) into v_paid_reward
  from public.quest_proposals qp where qp.id = new.quest_proposal_id;

  update public.quests set
    status = 'resolved',
    winning_proposal_id = new.quest_proposal_id,
    resolved_at = now(),
    escrow_locked = true,
    escrow_ref = new.id::text,
    reward_amount = greatest(coalesce(reward_amount, 0), coalesce(v_paid_reward, 0))
  where id = new.quest_id;

  return new;
end;
$$;

-- ═════════════════ 3. Tickets de caisse et avances ═════════════════
create table public.quest_purchase_proofs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  proposal_id uuid not null references public.quest_proposals(id) on delete cascade,
  quest_id uuid not null references public.quests(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  hunter_id uuid not null references public.users(id) on delete cascade,
  receipt_amount numeric(12,2) not null check (receipt_amount > 0),
  currency text not null,
  advance_amount numeric(12,2) not null check (advance_amount > 0),
  receipt_path text not null,
  photo_path text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reject_reason text,
  reviewed_by uuid references public.users(id),
  reviewed_at timestamptz,
  handover_deadline timestamptz,
  handed_over_at timestamptz,
  overdue_notified_at timestamptz
);
comment on table public.quest_purchase_proofs is 'Tickets de caisse des chasseurs : une avance par offre, validée par un agent.';

create unique index quest_purchase_proofs_one_active on public.quest_purchase_proofs (proposal_id)
  where status in ('pending', 'approved');
create index quest_purchase_proofs_queue on public.quest_purchase_proofs (status, created_at);
create index quest_purchase_proofs_hunter on public.quest_purchase_proofs (hunter_id, status);
create index quest_purchase_proofs_order on public.quest_purchase_proofs (order_id);

alter table public.quest_purchase_proofs enable row level security;
create policy quest_purchase_proofs_select on public.quest_purchase_proofs for select to authenticated
  using (hunter_id = public.my_user_id() or public.is_payment_staff());
revoke insert, update, delete, truncate on public.quest_purchase_proofs from anon, authenticated;

-- Photos : bucket privé, chemin <auth.uid()>/<proposal_id>/fichier
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quest-proofs', 'quest-proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;
create policy quest_proofs_upload_own on storage.objects for insert to authenticated
  with check (bucket_id = 'quest-proofs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy quest_proofs_read_own on storage.objects for select to authenticated
  using (bucket_id = 'quest-proofs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy quest_proofs_read_staff on storage.objects for select to authenticated
  using (bucket_id = 'quest-proofs' and public.is_payment_staff());

-- Montant en FCFA (null si aucun taux de change)
create or replace function public.quest_to_xaf(p_amount numeric, p_currency text)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.ledger_currency(p_currency) in ('XAF', 'XOF') then p_amount
    else public.convert_amount(p_amount, public.ledger_currency(p_currency), 'XAF') end
$$;
revoke all on function public.quest_to_xaf(numeric, text) from public, anon, authenticated;

-- Quêtes livrées (confirmées par l'équipe : commande « delivered »)
create or replace function public.quest_hunter_delivered_count(p_hunter_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.orders o
  join public.quest_proposals qp on qp.id = o.quest_proposal_id
  where qp.hunter_id = p_hunter_id and o.status = 'delivered'
$$;
revoke all on function public.quest_hunter_delivered_count(uuid) from public, anon, authenticated;

-- Avances en cours (demandées ou validées, colis pas encore livré), en FCFA
create or replace function public.quest_hunter_outstanding_xaf(p_hunter_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(coalesce(public.quest_to_xaf(p.advance_amount, p.currency), p.advance_amount)), 0)
  from public.quest_purchase_proofs p
  join public.orders o on o.id = p.order_id
  where p.hunter_id = p_hunter_id and p.status in ('pending', 'approved')
    and o.status not in ('delivered', 'cancelled', 'returned')
$$;
revoke all on function public.quest_hunter_outstanding_xaf(uuid) from public, anon, authenticated;

-- Ce que voit le chasseur dans son espace
create or replace function public.my_quest_advance_status()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.my_user_id();
  v_done integer;
  v_min integer := public.cfg_num('quest_advance_min_quests', 5)::int;
  v_cap numeric := public.cfg_num('quest_advance_cap_xaf', 150000);
  v_out numeric;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  v_done := public.quest_hunter_delivered_count(v_me);
  v_out := public.quest_hunter_outstanding_xaf(v_me);
  return json_build_object(
    'delivered', v_done, 'min_quests', v_min, 'eligible', v_done >= v_min,
    'outstanding_xaf', v_out, 'cap_xaf', v_cap, 'remaining_xaf', greatest(v_cap - v_out, 0),
    'handover_hours', public.cfg_num('quest_handover_hours', 72)::int);
end;
$$;
revoke all on function public.my_quest_advance_status() from public, anon;
grant execute on function public.my_quest_advance_status() to authenticated;

-- Admins et agents de paiement
create or replace function public.notify_payment_staff(p_title text, p_body text, p_link text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, type, title, body, link)
  select s.id, 'money', p_title, p_body, p_link from (
    select u.id from public.users u where u.role = 'admin'
    union
    select r.user_id from public.staff_roles r where r.role = 'payment_agent'
  ) s
$$;
revoke all on function public.notify_payment_staff(text, text, text) from public, anon, authenticated;

create or replace function public.fmt_money(p_amount numeric, p_currency text)
returns text
language sql
immutable
set search_path = ''
as $$
  select public.ledger_round(p_amount, p_currency)::text || ' '
    || case when public.ledger_currency(p_currency) in ('XAF', 'XOF') then 'FCFA' else public.ledger_currency(p_currency) end
$$;

-- Le chasseur envoie son ticket
create or replace function public.submit_purchase_proof(
  p_proposal_id uuid, p_receipt_amount numeric, p_receipt_path text, p_photo_path text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.my_user_id();
  v_prop record;
  v_quest record;
  v_order uuid;
  v_advance numeric;
  v_advance_xaf numeric;
  v_prefix text;
  v_id uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  select * into v_prop from public.quest_proposals where id = p_proposal_id for update;
  if not found or v_prop.hunter_id is distinct from v_me then raise exception 'proposal_not_found'; end if;
  if v_prop.status <> 'selected' then raise exception 'proposal_not_selected'; end if;
  if (select hunter_status from public.users where id = v_me) is distinct from 'verified' then
    raise exception 'hunter_not_verified';
  end if;

  select id into v_order from public.orders where quest_proposal_id = v_prop.id and status = 'processing';
  if not found then raise exception 'order_not_paid'; end if;
  select * into v_quest from public.quests where id = v_prop.quest_id;

  if coalesce(p_receipt_amount, 0) <= 0 then raise exception 'invalid_amount'; end if;
  v_prefix := auth.uid()::text || '/' || p_proposal_id::text || '/';
  if coalesce(p_receipt_path, '') not like v_prefix || '%' or coalesce(p_photo_path, '') not like v_prefix || '%' then
    raise exception 'invalid_proof_path';
  end if;

  -- Une demande à la fois par chasseur, pour que le plafond tienne
  perform pg_advisory_xact_lock(hashtext('quest_advance:' || v_me::text));

  if exists (select 1 from public.quest_purchase_proofs where proposal_id = p_proposal_id and status in ('pending', 'approved')) then
    raise exception 'proof_already_sent';
  end if;
  if public.quest_hunter_delivered_count(v_me) < public.cfg_num('quest_advance_min_quests', 5) then
    raise exception 'advance_not_eligible';
  end if;

  -- Le ticket fait foi, sans jamais dépasser le prix accepté par l'acheteur
  v_advance := public.ledger_round(least(p_receipt_amount, v_prop.proposed_price), v_quest.currency);
  v_advance_xaf := public.quest_to_xaf(v_advance, v_quest.currency);
  if v_advance_xaf is null then raise exception 'fx_rate_missing'; end if;
  if public.quest_hunter_outstanding_xaf(v_me) + v_advance_xaf > public.cfg_num('quest_advance_cap_xaf', 150000) then
    raise exception 'advance_cap_reached';
  end if;

  insert into public.quest_purchase_proofs (proposal_id, quest_id, order_id, hunter_id, receipt_amount, currency,
    advance_amount, receipt_path, photo_path)
  values (p_proposal_id, v_prop.quest_id, v_order, v_me, public.ledger_round(p_receipt_amount, v_quest.currency),
    v_quest.currency, v_advance, p_receipt_path, p_photo_path)
  returning id into v_id;

  perform public.notify_payment_staff('Ticket de caisse à vérifier',
    'Avance demandée : ' || public.fmt_money(v_advance, v_quest.currency) || ' pour la quête « ' || coalesce(v_quest.title, '') || ' ».',
    '/admin/paiements?tab=tickets');
  return v_id;
end;
$$;
revoke all on function public.submit_purchase_proof(uuid, numeric, text, text) from public, anon;
grant execute on function public.submit_purchase_proof(uuid, numeric, text, text) to authenticated;

-- ═════════════════ 4. Grand livre ═════════════════
-- Encaissement d'une commande payée (sans attendre la livraison). Idempotent.
create or replace function public.post_order_cash(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
  p record;
  v_cur text;
  v_buyer_cur text;
  v_cash numeric;
  v_holder text;
  v_shop uuid;
  v_margin numeric;
  v_src text;
  v_n integer := 0;
  v_rows integer;
begin
  select * into o from public.orders where id = p_order_id;
  if not found then return 0; end if;
  select * into p from public.payments
  where order_id = o.id and type = 'order_payment' and status = 'paid'
  order by updated_at desc nulls last limit 1;
  if not found then return 0; end if;

  v_cur := public.ledger_currency(o.currency);
  v_buyer_cur := public.ledger_currency(coalesce(p.currency, o.buyer_currency, o.currency));
  v_cash := coalesce(p.amount, o.buyer_total_amount, o.total_amount);
  v_holder := public.ledger_holder(p.method, p.provider, p.metadata);
  v_src := case when o.quest_proposal_id is null then 'sale' else 'quest' end;
  select shop_id into v_shop from public.order_items where order_id = o.id limit 1;

  insert into public.ledger_entries (type, source, order_id, line_key, shop_id, amount, currency, payment_method, collected_by, reference, notes)
  values ('vente_encaissee', v_src, o.id, 'order', v_shop,
    public.ledger_round(v_cash, v_buyer_cur), v_buyer_cur, public.ledger_method(p.method), v_holder,
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
      values ('marge_change', v_src, o.id, 'order', v_shop,
        public.ledger_round(v_cash * v_margin / (100 + v_margin), v_buyer_cur), v_buyer_cur, v_holder)
      on conflict do nothing;
      get diagnostics v_rows = row_count; v_n := v_n + v_rows;
    end if;
  end if;
  return v_n;
end;
$$;
revoke all on function public.post_order_cash(uuid) from public, anon, authenticated;

-- Commande livrée et payée. Quête avec avance : le reste seulement, et l'écart
-- entre l'offre et le ticket est rendu à l'acheteur.
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
  v_comm numeric;
  v_adv numeric;
  v_proof_adv numeric;
  v_gap numeric := 0;
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

  v_n := public.post_order_cash(o.id);

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
    select qp.hunter_id, qp.proposed_price, coalesce(qu.reward_amount, 0) as reward into q
    from public.quest_proposals qp join public.quests qu on qu.id = qp.quest_id
    where qp.id = o.quest_proposal_id;
    if found then
      v_comm := public.ledger_round(q.reward * public.cfg_num('quest_commission_pct', 10) / 100, v_cur);
      insert into public.ledger_entries (type, source, order_id, line_key, hunter_id, amount, currency, notes)
      values ('commission_wenna', 'quest', o.id, 'quest', q.hunter_id, v_comm, v_cur,
        public.cfg_num('quest_commission_pct', 10) || ' % de la récompense')
      on conflict do nothing;
      get diagnostics v_rows = row_count; v_n := v_n + v_rows;

      -- Avance déjà passée au grand livre, et écart ticket / offre
      select coalesce(sum(amount), 0) into v_adv from public.ledger_entries
      where order_id = o.id and type = 'part_chasseur' and line_key = 'quest:avance';
      select advance_amount into v_proof_adv from public.quest_purchase_proofs
      where order_id = o.id and status = 'approved' limit 1;
      if found then
        v_gap := greatest(coalesce(q.proposed_price, 0) - v_proof_adv, 0);
      end if;

      insert into public.ledger_entries (type, source, order_id, line_key, hunter_id, amount, currency, notes)
      values ('part_chasseur', 'quest', o.id, 'quest', q.hunter_id,
        public.ledger_round(o.total_amount - v_comm - v_adv - v_gap, v_cur), v_cur,
        case when v_adv > 0 then 'Transport + récompense − commission (produit déjà avancé)'
          else 'Produit + transport + récompense − commission' end)
      on conflict do nothing;
      get diagnostics v_rows = row_count; v_n := v_n + v_rows;

      if v_gap > 0 and coalesce(o.total_amount, 0) > 0 then
        insert into public.ledger_entries (type, source, order_id, line_key, hunter_id, amount, currency, payment_method, collected_by, notes)
        values ('remboursement', 'quest', o.id, 'ecart_ticket', q.hunter_id,
          public.ledger_round(v_gap * v_cash / o.total_amount, v_buyer_cur), v_buyer_cur, public.ledger_method(p.method), v_holder,
          'Écart entre l''offre et le ticket de caisse, à rendre à l''acheteur')
        on conflict do nothing;
        get diagnostics v_rows = row_count; v_n := v_n + v_rows;
      end if;
    end if;
  end if;

  return v_n;
end;
$$;
revoke all on function public.post_order_ledger(uuid) from public, anon, authenticated;

-- Annulation / retour : l'avance est annulée comme le reste (le chasseur la
-- doit alors à Wenna : solde négatif, retenu sur ses gains suivants).
create or replace function public.reverse_order_ledger(p_order_id uuid, p_reason text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale record;
  e record;
  v_already numeric;
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

  -- Un écart de ticket déjà rendu n'est pas remboursé deux fois
  select coalesce(sum(amount), 0) into v_already from public.ledger_entries
  where order_id = p_order_id and type = 'remboursement' and line_key = 'ecart_ticket' and currency = v_sale.currency;

  insert into public.ledger_entries (type, source, order_id, line_key, shop_id, amount, currency, payment_method, collected_by, notes)
  values ('remboursement', v_sale.source, p_order_id, 'order', v_sale.shop_id, v_sale.amount - v_already, v_sale.currency,
    v_sale.payment_method, v_sale.collected_by, 'Remboursement à l''acheteur' || coalesce(' : ' || p_reason, ''))
  on conflict do nothing;
  get diagnostics v_rows = row_count; v_n := v_n + v_rows;
  return v_n;
end;
$$;
revoke all on function public.reverse_order_ledger(uuid, text) from public, anon, authenticated;

-- ═════════════════ 5. Validation par un agent ═════════════════
create or replace function public.review_purchase_proof(p_proof_id uuid, p_action text, p_reason text default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.my_user_id();
  v_proof record;
  v_quest_title text;
  v_prop_status text;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_hours integer := public.cfg_num('quest_handover_hours', 72)::int;
  v_deadline timestamptz;
begin
  if not public.is_payment_staff() then raise exception 'forbidden'; end if;
  if p_action not in ('approve', 'reject') then raise exception 'invalid_action'; end if;

  select * into v_proof from public.quest_purchase_proofs where id = p_proof_id for update;
  if not found then raise exception 'proof_not_found'; end if;
  if v_proof.hunter_id = v_me and public.get_my_role() is distinct from 'admin' then raise exception 'forbidden'; end if;
  if v_proof.status <> 'pending' then raise exception 'not_pending'; end if;
  select title into v_quest_title from public.quests where id = v_proof.quest_id;

  if p_action = 'reject' then
    if v_reason is null then raise exception 'reason_required'; end if;
    update public.quest_purchase_proofs set status = 'rejected', reject_reason = v_reason,
      reviewed_by = v_me, reviewed_at = now(), updated_at = now()
    where id = p_proof_id;
    insert into public.notifications (user_id, type, title, body, link)
    values (v_proof.hunter_id, 'money', 'Ticket non validé',
      'Motif : ' || v_reason || '. Tu peux renvoyer un ticket, ou être payé à la livraison comme d''habitude.', '/chasseur');
    return json_build_object('status', 'rejected');
  end if;

  -- approve : la commande doit être payée et le colis pas encore livré
  if not exists (select 1 from public.orders where id = v_proof.order_id and status in ('processing', 'shipped')) then
    raise exception 'order_not_active';
  end if;
  if not exists (select 1 from public.payments where order_id = v_proof.order_id and type = 'order_payment' and status = 'paid') then
    raise exception 'order_not_paid';
  end if;
  select status into v_prop_status from public.quest_proposals where id = v_proof.proposal_id;

  v_deadline := now() + make_interval(hours => v_hours);
  update public.quest_purchase_proofs set status = 'approved', reviewed_by = v_me, reviewed_at = now(),
    handover_deadline = v_deadline,
    handed_over_at = case when v_prop_status in ('in_delivery', 'delivered', 'reward_paid') then now() end,
    updated_at = now()
  where id = p_proof_id;

  -- Encaissement + avance au grand livre : le chasseur peut être payé tout de suite
  perform public.post_order_cash(v_proof.order_id);
  insert into public.ledger_entries (type, source, order_id, line_key, hunter_id, amount, currency, notes, created_by)
  values ('part_chasseur', 'quest', v_proof.order_id, 'quest:avance', v_proof.hunter_id,
    public.ledger_round(v_proof.advance_amount, v_proof.currency), public.ledger_currency(v_proof.currency),
    'Avance sur achat (ticket validé)', v_me)
  on conflict do nothing;

  insert into public.notifications (user_id, type, title, body, link)
  values (v_proof.hunter_id, 'money', 'Avance validée',
    'Avance de ' || public.fmt_money(v_proof.advance_amount, v_proof.currency) || ' validée pour « ' || coalesce(v_quest_title, 'ta quête')
      || ' ». Remets le colis au transport avant le ' || to_char(v_deadline at time zone 'Africa/Libreville', 'DD/MM à HH24:MI')
      || ', puis marque-le comme envoyé.', '/chasseur');
  return json_build_object('status', 'approved', 'handover_deadline', v_deadline);
end;
$$;
revoke all on function public.review_purchase_proof(uuid, text, text) from public, anon;
grant execute on function public.review_purchase_proof(uuid, text, text) to authenticated;

-- File de l'agent
create or replace function public.purchase_proof_queue(p_status text default 'pending', p_limit int default 200)
returns table (
  id uuid, created_at timestamptz, status text, quest_title text, quest_id uuid, order_id uuid, proposal_id uuid,
  hunter_id uuid, hunter_name text, hunter_phone text, proposed_price numeric, receipt_amount numeric,
  advance_amount numeric, currency text, receipt_path text, photo_path text, reject_reason text,
  reviewed_at timestamptz, handover_deadline timestamptz, handed_over_at timestamptz,
  delivered_count int, outstanding_xaf numeric, order_status text, order_ref text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.created_at, p.status, q.title, p.quest_id, p.order_id, p.proposal_id,
    p.hunter_id, coalesce(nullif(trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), ''), u.full_name, u.email),
    u.phone, qp.proposed_price, p.receipt_amount, p.advance_amount, p.currency, p.receipt_path, p.photo_path, p.reject_reason,
    p.reviewed_at, p.handover_deadline, p.handed_over_at,
    public.quest_hunter_delivered_count(p.hunter_id), public.quest_hunter_outstanding_xaf(p.hunter_id),
    o.status, upper(left(p.order_id::text, 8))
  from public.quest_purchase_proofs p
  left join public.quests q on q.id = p.quest_id
  left join public.quest_proposals qp on qp.id = p.proposal_id
  left join public.users u on u.id = p.hunter_id
  left join public.orders o on o.id = p.order_id
  where public.is_payment_staff()
    and (p_status is null
      or p.status = p_status
      or (p_status = 'overdue' and p.status = 'approved' and p.handed_over_at is null and p.handover_deadline < now()))
  order by p.created_at asc
  limit p_limit
$$;
revoke all on function public.purchase_proof_queue(text, int) from public, anon;
grant execute on function public.purchase_proof_queue(text, int) to authenticated;

-- ═════════════════ 6. Remise au transport ═════════════════
create or replace function public.quest_proposals_handover()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.status in ('in_delivery', 'delivered', 'reward_paid') then
    update public.quest_purchase_proofs set handed_over_at = now(), updated_at = now()
    where proposal_id = new.id and status = 'approved' and handed_over_at is null;
  end if;
  return new;
end;
$$;
create trigger quest_proposals_handover
  after update of status on public.quest_proposals
  for each row execute function public.quest_proposals_handover();

-- Toutes les heures : avances dont le colis n'est pas parti dans les délais
create or replace function public.flag_overdue_quest_handover()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_n integer := 0;
begin
  for r in
    select p.id, p.hunter_id, p.advance_amount, p.currency, q.title
    from public.quest_purchase_proofs p
    left join public.quests q on q.id = p.quest_id
    where p.status = 'approved' and p.handed_over_at is null and p.overdue_notified_at is null
      and p.handover_deadline < now()
    for update of p skip locked
  loop
    update public.quest_purchase_proofs set overdue_notified_at = now(), updated_at = now() where id = r.id;
    insert into public.notifications (user_id, type, title, body, link)
    values (r.hunter_id, 'money', 'Colis en retard',
      'Le délai pour remettre le colis de « ' || coalesce(r.title, 'ta quête') || ' » au transport est dépassé. '
        || 'Envoie-le tout de suite et marque-le comme envoyé, sinon ton compte chasseur peut être suspendu et l''avance récupérée.', '/chasseur');
    perform public.notify_payment_staff('Avance : colis non envoyé',
      'Avance de ' || public.fmt_money(r.advance_amount, r.currency) || ' pour « ' || coalesce(r.title, '') || ' » : délai de remise au transport dépassé.',
      '/admin/paiements?tab=tickets');
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.flag_overdue_quest_handover() from public, anon, authenticated;

select cron.schedule('flag-overdue-quest-handover', '7 * * * *', 'select public.flag_overdue_quest_handover()');
