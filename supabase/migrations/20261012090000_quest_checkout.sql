-- Paiement de la quête au choix de l'offre.
--
-- Choisir une offre crée une commande (orders) liée à la proposition :
-- produit + transport réel + récompense. L'acheteur la paie par le tunnel
-- habituel (/paiement : mobile money ou virement, jamais à la livraison).
-- L'argent reste chez WennaShop jusqu'à la réception. Ce n'est qu'une fois le
-- paiement confirmé (commande pending -> processing) que la proposition est
-- retenue et que le chasseur est prévenu.

alter table public.orders
  add column if not exists quest_id uuid references public.quests(id) on delete set null,
  add column if not exists quest_proposal_id uuid references public.quest_proposals(id) on delete set null;

-- Une seule commande en attente par quête
create unique index if not exists orders_one_pending_per_quest
  on public.orders (quest_id) where quest_id is not null and status = 'pending';

-- Conversion avec marge de sécurité, même règle que convertPrice
-- (src/lib/currency.js). FCFA = XAF. Null si aucun taux.
create or replace function public.convert_amount(p_amount numeric, p_from text, p_to text)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from text := case when upper(p_from) = 'FCFA' then 'XAF' else upper(p_from) end;
  v_to text := case when upper(p_to) = 'FCFA' then 'XAF' else upper(p_to) end;
  fx record;
begin
  if p_amount is null then return null; end if;
  if v_from = v_to then return p_amount; end if;
  select rate, safety_margin_percent into fx
  from public.exchange_rates where base_currency = v_from and quote_currency = v_to;
  if not found then return null; end if;
  return ceil(p_amount * fx.rate * (1 + fx.safety_margin_percent / 100.0));
end;
$$;

-- L'acheteur choisit une offre : crée (ou remplace) la commande à payer.
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
  v_total := v_prop.proposed_price + v_prop.shipping_cost + coalesce(v_quest.reward_amount, 0);

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

-- Paiement confirmé : la proposition est retenue, les autres écartées,
-- la quête est résolue et l'argent marqué comme bloqué.
create or replace function public.orders_quest_paid()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.quest_proposal_id is null or old.status <> 'pending' or new.status <> 'processing' then
    return new;
  end if;

  update public.quest_proposals set status = 'selected', selected_at = now()
  where id = new.quest_proposal_id and status = 'pending';

  update public.quest_proposals set status = 'rejected'
  where quest_id = new.quest_id and id <> new.quest_proposal_id and status = 'pending';

  update public.quests set
    status = 'resolved',
    winning_proposal_id = new.quest_proposal_id,
    resolved_at = now(),
    escrow_locked = true,
    escrow_ref = new.id::text
  where id = new.quest_id;

  return new;
end;
$$;

create trigger orders_quest_paid
  after update of status on public.orders
  for each row execute function public.orders_quest_paid();

-- Un acheteur ne peut plus résoudre sa quête lui-même : cela passe par le
-- paiement. Il peut toujours annuler une quête ouverte. (SECURITY INVOKER :
-- current_user est le rôle de l'appelant ; les fonctions serveur, l'admin et
-- le service_role ne sont pas concernés.)
create or replace function public.quests_guard_resolution()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') or public.get_my_role() = 'admin' then
    return new;
  end if;
  if new.winning_proposal_id is distinct from old.winning_proposal_id
     or new.escrow_locked is distinct from old.escrow_locked
     or new.escrow_ref is distinct from old.escrow_ref
     or new.resolved_at is distinct from old.resolved_at
     or (new.status is distinct from old.status and not (old.status = 'open' and new.status = 'cancelled')) then
    raise exception 'Le choix d''une offre passe par le paiement.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger quests_guard_resolution
  before update on public.quests
  for each row execute function public.quests_guard_resolution();

-- Le poids (donc le prix) ne bouge plus pendant qu'un paiement est en cours.
create or replace function public.quest_proposals_compute_shipping()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quest record;
  v_origin text;
begin
  if tg_op = 'UPDATE' then
    if new.weight_kg is not distinct from old.weight_kg then
      new.shipping_cost := old.shipping_cost;
      return new;
    end if;
    if old.status <> 'pending' then
      raise exception 'Le poids ne peut plus changer une fois la proposition retenue.' using errcode = '23514';
    end if;
    if exists (select 1 from public.orders where quest_proposal_id = new.id and status = 'pending') then
      raise exception 'L''acheteur est en train de payer cette offre : le poids ne peut plus changer.' using errcode = '23514';
    end if;
  end if;

  select country_target, destination_country, currency into v_quest
  from public.quests where id = new.quest_id;

  select nullif(country, 'Autre') into v_origin from public.users where id = new.hunter_id;
  v_origin := coalesce(v_origin, v_quest.country_target);

  new.shipping_cost := public.quest_shipping_quote(
    new.weight_kg, v_origin, v_quest.destination_country, v_quest.currency
  );
  return new;
end;
$$;

-- Pas de paiement à la livraison pour une quête (le chasseur achèterait
-- sans garantie). Reste de submit_checkout inchangé.
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
$function$;

-- Le chasseur doit continuer à voir une quête sur laquelle il a proposé, même
-- résolue (sinon son offre payée s'affiche sans titre ni récompense).
-- Fonction SECURITY DEFINER pour éviter la récursion entre les règles
-- d'accès de quests et de quest_proposals.
create or replace function public.is_quest_hunter(p_quest_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.quest_proposals
    where quest_id = p_quest_id and hunter_id = public.my_user_id()
  )
$$;

create policy quests_select_hunter on public.quests
  for select to authenticated
  using (public.is_quest_hunter(id));

-- Le nettoyage automatique (#77) supprimait toute quête quittant « open »,
-- propositions comprises : une quête payée aurait été effacée avec l'offre
-- retenue. On ne supprime plus rien (les listes n'affichent de toute façon que
-- les quêtes ouvertes) ; une quête annulée ou expirée annule seulement sa
-- commande non payée.
create or replace function public.quests_delete_on_activate()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if old.status = 'open' and new.status in ('cancelled', 'expired') then
    update orders set status = 'cancelled', updated_at = now()
    where quest_id = old.id and status = 'pending';
  end if;
  return new;
end;
$function$;
