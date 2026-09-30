-- La gestion d'équipe s'ouvre à tous les propriétaires de boutique validés
-- (en plus des admins). Reste facultative : rien ne change sans membre.

create or replace function public.can_manage_team(p_shop uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select get_my_role() = 'admin' or exists (
    select 1 from public.shops s join public.users u on u.id = s.user_id
    where s.id = p_shop and s.user_id = public.my_user_id() and u.status = 'active'
  )
$$;

create or replace function public.add_shop_member(p_shop uuid, p_email text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user uuid; v_role text; v_owner uuid; v_shop_name text; v_inserted int;
begin
  if not public.can_manage_team(p_shop) then
    raise exception 'Seul le propriétaire (validé) de la boutique peut gérer son équipe.';
  end if;
  select user_id, name into v_owner, v_shop_name from shops where id = p_shop;
  if v_owner is null then raise exception 'Boutique introuvable'; end if;

  select id, role into v_user, v_role from users
   where lower(email) = lower(trim(p_email)) and coalesce(status, '') not in ('deleted', 'deletion_requested')
   limit 1;
  if v_user is null then raise exception 'Aucun compte WennaShop avec cet e-mail : la personne doit d''abord s''inscrire.'; end if;
  if v_user = v_owner then raise exception 'Cette personne est déjà propriétaire de la boutique.'; end if;
  if v_role in ('artisan', 'admin') then
    raise exception 'Cette personne a déjà son propre compte vendeur : elle doit utiliser un compte acheteur pour rejoindre une équipe.';
  end if;
  if exists (select 1 from shop_members where user_id = v_user and shop_id <> p_shop) then
    raise exception 'Cette personne fait déjà partie de l''équipe d''une autre boutique.';
  end if;
  if (select count(*) from shop_members where shop_id = p_shop) >= 10 then
    raise exception 'Limite de 10 membres atteinte pour cette boutique.';
  end if;

  insert into shop_members (shop_id, user_id, added_by) values (p_shop, v_user, my_user_id())
  on conflict do nothing;
  get diagnostics v_inserted = row_count;

  -- Le nom de boutique est saisi par le vendeur et finit dans le HTML de
  -- l'e-mail (send-notification-email) : on l'échappe.
  if v_inserted > 0 then
    insert into notifications (user_id, type, title, body, link) values (
      v_user, 'shop_team_added', 'Tu rejoins l''équipe d''une boutique',
      'Tu peux maintenant gérer la boutique « '
        || replace(replace(replace(coalesce(v_shop_name, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;')
        || ' » sur WennaShop : produits, commandes et revenus.',
      '/vendeur'
    );
  end if;
  return v_user;
end;
$$;

create or replace function public.list_shop_members(p_shop uuid)
returns table (user_id uuid, full_name text, email text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select u.id, u.full_name, u.email, m.created_at
  from shop_members m join users u on u.id = m.user_id
  where m.shop_id = p_shop and public.can_manage_team(p_shop)
  order by m.created_at
$$;

create or replace function public.remove_shop_member(p_shop uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_team(p_shop) then
    raise exception 'Seul le propriétaire (validé) de la boutique peut gérer son équipe.';
  end if;
  delete from shop_members where shop_id = p_shop and user_id = p_user;
end;
$$;

revoke execute on function public.remove_shop_member(uuid, uuid) from anon;
revoke execute on function public.can_manage_team(uuid) from anon;
