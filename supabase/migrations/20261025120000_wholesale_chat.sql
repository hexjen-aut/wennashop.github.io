-- Commandes en gros : discussion acheteur ↔ boutique, devis, puis commande
-- payée via WennaShop au prix négocié (commission prélevée comme d'habitude).
--
-- - Le vendeur active le gros produit par produit et fixe sa quantité minimale.
-- - N'importe quel acheteur connecté ouvre une discussion (depuis la fiche
--   produit ou la page de la boutique).
-- - Le vendeur envoie un devis (produit, version, quantité, prix unitaire) ;
--   l'acheteur l'accepte : une commande « pending » est créée et il paie sur
--   la page de paiement habituelle.
-- - L'équipe ne lit une discussion que si l'un des deux la signale.
-- - Aucune coordonnée ne passe : numéros, emails et liens sont masqués à
--   l'enregistrement, toute la transaction se fait sur WennaShop.
-- Toutes les écritures passent par les fonctions ci-dessous (security definer).

alter table public.products
  add column if not exists wholesale_enabled boolean not null default false,
  add column if not exists wholesale_min_qty integer not null default 10;
alter table public.products
  add constraint products_wholesale_min_qty_range check (wholesale_min_qty between 2 and 100000);

create table public.wholesale_threads (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  buyer_id uuid not null references public.users(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'closed')),
  flagged_at timestamptz,
  flag_reason text check (flag_reason is null or char_length(flag_reason) <= 500),
  buyer_read_at timestamptz,
  shop_read_at timestamptz,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index wholesale_threads_shop_idx on public.wholesale_threads (shop_id, last_message_at desc);
create index wholesale_threads_buyer_idx on public.wholesale_threads (buyer_id, last_message_at desc);
-- Une seule discussion ouverte par acheteur, boutique et produit.
create unique index wholesale_threads_one_open on public.wholesale_threads (shop_id, buyer_id, product_id)
  nulls not distinct where status = 'open';

create table public.wholesale_quotes (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.wholesale_threads(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete set null,
  variant_label text,
  quantity integer not null check (quantity between 1 and 100000),
  unit_price numeric not null check (unit_price > 0),
  currency text not null,
  note text check (note is null or char_length(note) <= 1000),
  status text not null default 'proposed' check (status in ('proposed', 'declined', 'cancelled', 'ordered')),
  order_id uuid references public.orders(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);
create index wholesale_quotes_thread_idx on public.wholesale_quotes (thread_id);

create table public.wholesale_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.wholesale_threads(id) on delete cascade,
  sender_id uuid references public.users(id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000),
  quote_id uuid references public.wholesale_quotes(id) on delete set null,
  created_at timestamptz not null default now()
);
create index wholesale_messages_thread_idx on public.wholesale_messages (thread_id, created_at);

alter table public.order_items
  add column if not exists wholesale_quote_id uuid references public.wholesale_quotes(id) on delete set null;

-- ── Qui voit quoi ──
create or replace function public.wholesale_role(p_thread_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when t.buyer_id = public.my_user_id() then 'buyer'
    when exists (select 1 from public.shops s where s.id = t.shop_id and public.can_manage_seller(s.user_id)) then 'seller'
    when public.get_my_role() = 'admin' and t.flagged_at is not null then 'admin'
  end
  from public.wholesale_threads t where t.id = p_thread_id
$$;

alter table public.wholesale_threads enable row level security;
alter table public.wholesale_quotes enable row level security;
alter table public.wholesale_messages enable row level security;
create policy wholesale_threads_select on public.wholesale_threads for select using (public.wholesale_role(id) is not null);
create policy wholesale_quotes_select on public.wholesale_quotes for select using (public.wholesale_role(thread_id) is not null);
create policy wholesale_messages_select on public.wholesale_messages for select using (public.wholesale_role(thread_id) is not null);

-- Masque numéros de téléphone (8 chiffres ou plus), emails et liens.
create or replace function public.wholesale_mask_contacts(p text)
returns text language sql immutable set search_path = public as $$
  select regexp_replace(
           regexp_replace(
             regexp_replace(coalesce(p, ''), '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[coordonnée masquée]', 'g'),
             '(https?://|www\.)\S+|\m(wa\.me|t\.me|chat\.whatsapp\.com|whatsapp\.com|instagram\.com|facebook\.com|fb\.me|m\.me)\S*', '[lien masqué]', 'gi'),
           '\+?\d([\s.()/-]*\d){7,}', '[numéro masqué]', 'g')
$$;

-- Notifie l'autre partie d'un nouveau message (lien vers la discussion).
create or replace function public.wholesale_notify(p_thread_id uuid, p_from_role text, p_title text, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare t record; v_target uuid;
begin
  select th.*, s.user_id as shop_user into t from public.wholesale_threads th join public.shops s on s.id = th.shop_id where th.id = p_thread_id;
  v_target := case when p_from_role = 'buyer' then t.shop_user else t.buyer_id end;
  if v_target is null then return; end if;
  insert into public.notifications (user_id, type, title, body, link)
  values (v_target, 'wholesale', p_title, left(p_body, 200), '/gros?t=' || p_thread_id);
end $$;

-- ── Ouvrir une discussion ──
create or replace function public.open_wholesale_thread(p_shop_id uuid, p_product_id uuid, p_quantity integer, p_message text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.my_user_id();
  v_shop record; v_prod record; v_thread uuid; v_body text;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  select * into v_shop from public.shops where id = p_shop_id and status = 'active';
  if not found then raise exception 'shop_not_found'; end if;
  if p_product_id is not null then
    select * into v_prod from public.products where id = p_product_id and shop_id = p_shop_id and status = 'active';
    if not found or not v_prod.wholesale_enabled then raise exception 'wholesale_not_available'; end if;
    if coalesce(p_quantity, 0) < v_prod.wholesale_min_qty then raise exception 'below_min_qty'; end if;
  elsif not exists (select 1 from public.products where shop_id = p_shop_id and status = 'active' and wholesale_enabled) then
    raise exception 'wholesale_not_available';
  end if;
  v_body := public.wholesale_mask_contacts(btrim(coalesce(p_message, '')));
  if char_length(v_body) < 1 or char_length(v_body) > 2000 then raise exception 'invalid_message'; end if;

  select id into v_thread from public.wholesale_threads
  where shop_id = p_shop_id and buyer_id = v_me and product_id is not distinct from p_product_id and status = 'open';
  if v_thread is null then
    insert into public.wholesale_threads (shop_id, buyer_id, product_id) values (p_shop_id, v_me, p_product_id) returning id into v_thread;
  end if;
  if p_quantity is not null and p_product_id is not null then
    v_body := 'Quantité souhaitée : ' || p_quantity || E'\n' || v_body;
  end if;
  insert into public.wholesale_messages (thread_id, sender_id, body) values (v_thread, v_me, v_body);
  update public.wholesale_threads set last_message_at = now(), buyer_read_at = now() where id = v_thread;
  perform public.wholesale_notify(v_thread, 'buyer', 'Nouvelle demande en gros', v_body);
  return v_thread;
end $$;

-- ── Écrire ──
create or replace function public.send_wholesale_message(p_thread_id uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_role text := public.wholesale_role(p_thread_id); v_id uuid; v_body text := public.wholesale_mask_contacts(btrim(coalesce(p_body, '')));
begin
  if v_role not in ('buyer', 'seller') then raise exception 'not_allowed'; end if;
  if char_length(v_body) < 1 or char_length(v_body) > 2000 then raise exception 'invalid_message'; end if;
  if exists (select 1 from public.wholesale_threads where id = p_thread_id and status <> 'open') then raise exception 'thread_closed'; end if;
  insert into public.wholesale_messages (thread_id, sender_id, body) values (p_thread_id, public.my_user_id(), v_body) returning id into v_id;
  update public.wholesale_threads set last_message_at = now(),
    buyer_read_at = case when v_role = 'buyer' then now() else buyer_read_at end,
    shop_read_at = case when v_role = 'seller' then now() else shop_read_at end
  where id = p_thread_id;
  perform public.wholesale_notify(p_thread_id, v_role, 'Nouveau message (commande en gros)', v_body);
  return v_id;
end $$;

-- ── Devis (boutique) ──
create or replace function public.propose_wholesale_quote(p_thread_id uuid, p_product_id uuid, p_variant_id uuid, p_quantity integer, p_unit_price numeric, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_thread record; v_prod record; v_var record; v_label text; v_id uuid; v_cur text;
begin
  if public.wholesale_role(p_thread_id) is distinct from 'seller' then raise exception 'not_allowed'; end if;
  select * into v_thread from public.wholesale_threads where id = p_thread_id;
  if v_thread.status <> 'open' then raise exception 'thread_closed'; end if;
  select * into v_prod from public.products where id = p_product_id and shop_id = v_thread.shop_id;
  if not found then raise exception 'product_not_found'; end if;
  if p_variant_id is not null then
    select * into v_var from public.product_variants where id = p_variant_id and product_id = p_product_id and is_active;
    if not found then raise exception 'variant_invalid'; end if;
    v_label := concat_ws(' · ', v_var.color, v_var.size);
  elsif exists (select 1 from public.product_variants where product_id = p_product_id and is_active) then
    raise exception 'variant_required';
  end if;
  if coalesce(p_quantity, 0) < 1 or coalesce(p_unit_price, 0) <= 0 then raise exception 'invalid_quote'; end if;
  v_cur := coalesce(v_prod.currency, 'MAD');
  -- Un nouveau devis remplace les devis encore en attente de la discussion.
  update public.wholesale_quotes set status = 'cancelled' where thread_id = p_thread_id and status = 'proposed';
  insert into public.wholesale_quotes (thread_id, product_id, variant_id, variant_label, quantity, unit_price, currency, note, created_by)
  values (p_thread_id, p_product_id, p_variant_id, v_label, p_quantity, p_unit_price, v_cur, nullif(public.wholesale_mask_contacts(btrim(coalesce(p_note, ''))), ''), public.my_user_id())
  returning id into v_id;
  insert into public.wholesale_messages (thread_id, sender_id, body, quote_id)
  values (p_thread_id, public.my_user_id(),
    'Devis : ' || p_quantity || ' × ' || v_prod.name || coalesce(' (' || v_label || ')', '') || ' à ' || p_unit_price || ' ' || v_cur || ' l''unité', v_id);
  update public.wholesale_threads set last_message_at = now(), shop_read_at = now() where id = p_thread_id;
  perform public.wholesale_notify(p_thread_id, 'seller', 'Devis reçu (commande en gros)', p_quantity || ' × ' || v_prod.name);
  return v_id;
end $$;

-- ── Réponse au devis (acheteur) : accepter crée la commande ──
create or replace function public.respond_wholesale_quote(p_quote_id uuid, p_accept boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.my_user_id();
  q record; v_shop record; v_cur text; v_total numeric; v_buyer_cur text; v_buyer_total numeric; v_order uuid; v_country text;
begin
  select * into q from public.wholesale_quotes where id = p_quote_id for update;
  if not found or public.wholesale_role(q.thread_id) is distinct from 'buyer' then raise exception 'quote_not_found'; end if;
  if q.status = 'ordered' and q.order_id is not null and p_accept then return q.order_id; end if;
  if q.status <> 'proposed' then raise exception 'quote_not_available'; end if;
  if not p_accept then
    update public.wholesale_quotes set status = 'declined' where id = p_quote_id;
    insert into public.wholesale_messages (thread_id, sender_id, body, quote_id) values (q.thread_id, v_me, 'Devis refusé.', p_quote_id);
    update public.wholesale_threads set last_message_at = now(), buyer_read_at = now() where id = q.thread_id;
    perform public.wholesale_notify(q.thread_id, 'buyer', 'Devis refusé', 'L''acheteur a refusé le devis.');
    return null;
  end if;
  if q.expires_at < now() then raise exception 'quote_expired'; end if;

  v_cur := case when upper(q.currency) = 'FCFA' then 'XAF' else upper(q.currency) end;
  v_total := round(q.unit_price * q.quantity, 2);
  select country into v_country from public.users where id = v_me;
  v_buyer_cur := case when lower(coalesce(v_country, '')) = 'maroc' then 'MAD' when lower(coalesce(v_country, '')) = 'gabon' then 'XAF' else v_cur end;
  v_buyer_total := public.convert_amount(v_total, v_cur, v_buyer_cur);
  if v_buyer_total is null then v_buyer_cur := v_cur; v_buyer_total := v_total; end if;

  insert into public.orders (user_id, status, subtotal, total_amount, currency, buyer_total_amount, buyer_currency)
  values (v_me, 'pending', v_total, v_total, v_cur, v_buyer_total, v_buyer_cur)
  returning id into v_order;
  update public.wholesale_quotes set status = 'ordered', order_id = v_order where id = p_quote_id;
  insert into public.order_items (order_id, product_id, variant_id, quantity, unit_price, wholesale_quote_id)
  values (v_order, q.product_id, q.variant_id, q.quantity, q.unit_price, p_quote_id);

  insert into public.wholesale_messages (thread_id, sender_id, body, quote_id) values (q.thread_id, v_me, 'Devis accepté : commande créée, en attente de paiement.', p_quote_id);
  update public.wholesale_threads set last_message_at = now(), buyer_read_at = now() where id = q.thread_id;
  perform public.wholesale_notify(q.thread_id, 'buyer', 'Devis accepté', 'La commande est créée et attend le paiement de l''acheteur.');
  return v_order;
end $$;

-- ── Lu, signalement, clôture ──
create or replace function public.mark_wholesale_read(p_thread_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_role text := public.wholesale_role(p_thread_id);
begin
  if v_role = 'buyer' then update public.wholesale_threads set buyer_read_at = now() where id = p_thread_id;
  elsif v_role = 'seller' then update public.wholesale_threads set shop_read_at = now() where id = p_thread_id;
  end if;
end $$;

create or replace function public.flag_wholesale_thread(p_thread_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_role text := public.wholesale_role(p_thread_id);
begin
  if v_role not in ('buyer', 'seller') then raise exception 'not_allowed'; end if;
  update public.wholesale_threads set flagged_at = coalesce(flagged_at, now()), flag_reason = left(nullif(public.wholesale_mask_contacts(btrim(coalesce(p_reason, ''))), ''), 500)
  where id = p_thread_id;
  insert into public.wholesale_messages (thread_id, sender_id, body)
  values (p_thread_id, public.my_user_id(), 'Discussion signalée à l''équipe WennaShop, qui peut maintenant la lire.');
  insert into public.notifications (user_id, type, title, body, link)
  select u.id, 'wholesale', 'Discussion de gros signalée', left(coalesce(p_reason, ''), 200), '/gros?t=' || p_thread_id
  from public.users u where u.role = 'admin';
end $$;

create or replace function public.close_wholesale_thread(p_thread_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.wholesale_role(p_thread_id) not in ('buyer', 'seller') then raise exception 'not_allowed'; end if;
  update public.wholesale_threads set status = 'closed' where id = p_thread_id;
  update public.wholesale_quotes set status = 'cancelled' where thread_id = p_thread_id and status = 'proposed';
end $$;

-- ── Ligne de commande issue d'un devis : prix négocié, commission normale ──
create or replace function public.order_items_set_commission()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_variant public.product_variants;
  v_quote public.wholesale_quotes;
begin
  select p.shop_id, p.price into new.shop_id, new.unit_price
  from products p
  where p.id = new.product_id;
  if new.unit_price is null then raise exception 'product_not_found'; end if;
  if coalesce(new.quantity, 0) < 1 then raise exception 'invalid_quantity'; end if;

  if new.wholesale_quote_id is not null then
    -- Devis de gros accepté : seul le prix, la version et la quantité du devis valent.
    select * into v_quote from wholesale_quotes where id = new.wholesale_quote_id;
    if v_quote.id is null or v_quote.order_id is distinct from new.order_id or v_quote.status <> 'ordered'
       or v_quote.product_id <> new.product_id or v_quote.variant_id is distinct from new.variant_id
       or v_quote.quantity <> new.quantity then
      raise exception 'quote_invalid';
    end if;
    new.unit_price := v_quote.unit_price;
    new.variant_label := v_quote.variant_label;
  elsif new.variant_id is not null then
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

revoke all on function public.open_wholesale_thread(uuid, uuid, integer, text) from public, anon;
revoke all on function public.send_wholesale_message(uuid, text) from public, anon;
revoke all on function public.propose_wholesale_quote(uuid, uuid, uuid, integer, numeric, text) from public, anon;
revoke all on function public.respond_wholesale_quote(uuid, boolean) from public, anon;
revoke all on function public.mark_wholesale_read(uuid) from public, anon;
revoke all on function public.flag_wholesale_thread(uuid, text) from public, anon;
revoke all on function public.close_wholesale_thread(uuid) from public, anon;
revoke all on function public.wholesale_notify(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.open_wholesale_thread(uuid, uuid, integer, text) to authenticated;
grant execute on function public.send_wholesale_message(uuid, text) to authenticated;
grant execute on function public.propose_wholesale_quote(uuid, uuid, uuid, integer, numeric, text) to authenticated;
grant execute on function public.respond_wholesale_quote(uuid, boolean) to authenticated;
grant execute on function public.mark_wholesale_read(uuid) to authenticated;
grant execute on function public.flag_wholesale_thread(uuid, text) to authenticated;
grant execute on function public.close_wholesale_thread(uuid) to authenticated;
