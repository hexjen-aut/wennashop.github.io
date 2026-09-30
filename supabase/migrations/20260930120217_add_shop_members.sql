-- Équipe de boutique : des comptes (souvent acheteurs) qui gèrent la boutique
-- d'un autre utilisateur — produits, commandes, revenus (lecture), fiche
-- boutique. Ajout/retrait réservé aux admins.

create table if not exists public.shop_members (
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  added_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (shop_id, user_id)
);
create index if not exists shop_members_user_idx on public.shop_members(user_id);
alter table public.shop_members enable row level security;

create or replace function public.my_user_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.users where auth_id = auth.uid() limit 1
$$;

create or replace function public.is_shop_member(p_shop uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shop_members where shop_id = p_shop and user_id = public.my_user_id())
$$;

create or replace function public.can_manage_seller(p_seller uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_seller is not null and (
    p_seller = public.my_user_id()
    or exists (
      select 1 from public.shop_members m join public.shops s on s.id = m.shop_id
      where s.user_id = p_seller and m.user_id = public.my_user_id()
    )
  )
$$;

drop policy if exists shop_members_admin_all on public.shop_members;
create policy shop_members_admin_all on public.shop_members
  for all using (get_my_role() = 'admin') with check (get_my_role() = 'admin');
drop policy if exists shop_members_read_own on public.shop_members;
create policy shop_members_read_own on public.shop_members
  for select using (user_id = public.my_user_id());

-- Produits : un membre agit pour le propriétaire (seller_id = propriétaire).
-- Un acheteur ne peut jamais créer/rattacher un produit à son propre compte.
drop policy if exists products_select on public.products;
create policy products_select on public.products for select using (
  status = 'active' or public.can_manage_seller(seller_id) or get_my_role() = 'admin'
);

drop policy if exists products_insert_seller on public.products;
create policy products_insert_seller on public.products for insert with check (
  get_my_role() = 'admin'
  or (get_my_role() = 'artisan' and seller_id = public.my_user_id())
  or (seller_id <> public.my_user_id() and public.can_manage_seller(seller_id))
);

drop policy if exists products_update on public.products;
create policy products_update on public.products for update
using (public.can_manage_seller(seller_id) or get_my_role() = 'admin')
with check (
  get_my_role() = 'admin'
  or (get_my_role() = 'artisan' and seller_id = public.my_user_id())
  or (seller_id <> public.my_user_id() and public.can_manage_seller(seller_id))
);

drop policy if exists products_delete_seller_or_admin on public.products;
create policy products_delete_seller_or_admin on public.products for delete using (
  public.can_manage_seller(seller_id) or get_my_role() = 'admin'
);

-- Boutique : les membres lisent et modifient la fiche, sans pouvoir en
-- changer le propriétaire (verrouillé par le trigger ci-dessous).
drop policy if exists shops_owner_read on public.shops;
create policy shops_owner_read on public.shops for select using (
  user_id = public.my_user_id() or public.is_shop_member(id)
);

drop policy if exists shops_owner_update on public.shops;
create policy shops_owner_update on public.shops for update
using (user_id = public.my_user_id() or public.is_shop_member(id))
with check (user_id = public.my_user_id() or public.is_shop_member(id));

create or replace function public.shops_protect_badges()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(get_my_role(), '') = 'admin' or current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_official := false;
    new.is_verified := false;
  else
    new.is_official := old.is_official;
    new.is_verified := old.is_verified;
    new.user_id := old.user_id;
  end if;
  return new;
end;
$$;

-- Commandes : vendeur = propriétaire du produit ou membre de sa boutique.
create or replace function public.is_order_seller(order_id_param uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.order_items oi
    join public.products p on p.id = oi.product_id
    where oi.order_id = order_id_param and public.can_manage_seller(p.seller_id)
  )
$$;

drop policy if exists order_items_select_seller on public.order_items;
create policy order_items_select_seller on public.order_items for select using (
  exists (select 1 from public.products p where p.id = order_items.product_id and public.can_manage_seller(p.seller_id))
);

-- Expédition : le vendeur (ou un membre) crée/met à jour la livraison.
drop policy if exists deliveries_insert_seller on public.deliveries;
create policy deliveries_insert_seller on public.deliveries for insert with check (public.is_order_seller(order_id));
drop policy if exists deliveries_update_seller on public.deliveries;
create policy deliveries_update_seller on public.deliveries for update using (public.is_order_seller(order_id));

-- Revenus : lecture seule pour l'équipe.
drop policy if exists vendor_wallets_select_team on public.vendor_wallets;
create policy vendor_wallets_select_team on public.vendor_wallets for select using (
  user_id <> public.my_user_id() and public.can_manage_seller(user_id)
);
drop policy if exists wallet_transactions_select_team on public.wallet_transactions;
create policy wallet_transactions_select_team on public.wallet_transactions for select using (
  user_id <> public.my_user_id() and public.can_manage_seller(user_id)
);

-- Gestion de l'équipe (admin) : recherche par e-mail côté serveur, pour ne
-- pas exposer la table users au client.
create or replace function public.add_shop_member(p_shop uuid, p_email text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_owner uuid;
begin
  if get_my_role() is distinct from 'admin' then raise exception 'Réservé aux administrateurs'; end if;
  select user_id into v_owner from shops where id = p_shop;
  if v_owner is null then raise exception 'Boutique introuvable'; end if;
  select id into v_user from users
   where lower(email) = lower(trim(p_email)) and coalesce(status, '') not in ('deleted', 'deletion_requested')
   limit 1;
  if v_user is null then raise exception 'Aucun compte WennaShop avec cet e-mail : la personne doit d''abord s''inscrire.'; end if;
  if v_user = v_owner then raise exception 'Cette personne est déjà propriétaire de la boutique.'; end if;
  insert into shop_members (shop_id, user_id, added_by) values (p_shop, v_user, my_user_id())
  on conflict do nothing;
  return v_user;
end;
$$;

create or replace function public.list_shop_members(p_shop uuid)
returns table (user_id uuid, full_name text, email text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select u.id, u.full_name, u.email, m.created_at
  from shop_members m join users u on u.id = m.user_id
  where m.shop_id = p_shop and get_my_role() = 'admin'
  order by m.created_at
$$;

revoke execute on function public.add_shop_member(uuid, text) from anon;
revoke execute on function public.list_shop_members(uuid) from anon;
