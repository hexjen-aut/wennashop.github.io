-- ============================================================
-- 1. Nouveaux statuts de compte + colonnes de suivi de la suppression
-- ============================================================
alter table public.users drop constraint users_status_check;
alter table public.users add constraint users_status_check
  check (status = any (array['active','inactive','pending','pending_deletion','deleted','banned']));

alter table public.users
  add column if not exists deletion_requested_at timestamptz,
  add column if not exists deletion_scheduled_at timestamptz;

comment on column public.users.deletion_requested_at is 'Date de la demande de suppression de compte par l''utilisateur.';
comment on column public.users.deletion_scheduled_at is 'Date à laquelle le compte sera anonymisé définitivement si la suppression n''est pas annulée (30 jours après la demande).';

-- ============================================================
-- 2. Demander la suppression du compte (délai de récupération : 30 jours)
-- ============================================================
create or replace function public.request_account_deletion(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_id uuid;
  v_role text;
begin
  select auth_id, role into v_auth_id, v_role from public.users where id = p_user_id;

  if v_auth_id is null then
    return jsonb_build_object('success', false, 'error', 'Compte introuvable');
  end if;
  if v_auth_id <> auth.uid() then
    return jsonb_build_object('success', false, 'error', 'Non autorisé');
  end if;

  update public.users
  set status = 'pending_deletion',
      deletion_requested_at = now(),
      deletion_scheduled_at = now() + interval '30 days',
      updated_at = now()
  where id = p_user_id;

  if v_role = 'artisan' then
    update public.shops set status = 'inactive', updated_at = now() where user_id = p_user_id;
    update public.products set status = 'inactive', updated_at = now() where seller_id = p_user_id;
  end if;

  insert into public.notifications (user_id, type, title, body, link)
  values (
    p_user_id,
    'account_deletion_requested',
    'Suppression de compte demandée',
    'Ton compte WennaShop sera définitivement supprimé dans 30 jours. Pour annuler, il te suffit de te reconnecter avant cette date.',
    '/compte'
  );

  return jsonb_build_object('success', true, 'deletion_scheduled_at', (now() + interval '30 days'));
end;
$$;

comment on function public.request_account_deletion(uuid) is 'Passe le compte en attente de suppression (30 jours de récupération), désactive boutique/produits si vendeur, notifie par email.';

-- ============================================================
-- 3. Annuler la suppression (ex : reconnexion pendant les 30 jours)
-- ============================================================
create or replace function public.cancel_account_deletion(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_id uuid;
  v_status text;
  v_scheduled timestamptz;
  v_role text;
begin
  select auth_id, status, deletion_scheduled_at, role into v_auth_id, v_status, v_scheduled, v_role
  from public.users where id = p_user_id;

  if v_auth_id is null or v_auth_id <> auth.uid() then
    return jsonb_build_object('success', false, 'error', 'Non autorisé');
  end if;
  if v_status is distinct from 'pending_deletion' then
    return jsonb_build_object('success', false, 'error', 'Aucune suppression en cours');
  end if;
  if v_scheduled is not null and v_scheduled < now() then
    return jsonb_build_object('success', false, 'error', 'Le délai de récupération est dépassé');
  end if;

  update public.users
  set status = 'active',
      deletion_requested_at = null,
      deletion_scheduled_at = null,
      updated_at = now()
  where id = p_user_id;

  if v_role = 'artisan' then
    update public.shops set status = 'active', updated_at = now() where user_id = p_user_id;
  end if;

  insert into public.notifications (user_id, type, title, body, link)
  values (
    p_user_id,
    'account_deletion_cancelled',
    'Suppression de compte annulée',
    'Bon retour ! Ta demande de suppression a été annulée, ton compte est de nouveau actif. (Tes produits restent désactivés — réactive-les manuellement depuis ta boutique.)',
    '/compte'
  );

  return jsonb_build_object('success', true);
end;
$$;

comment on function public.cancel_account_deletion(uuid) is 'Annule une suppression de compte en cours si le délai de 30 jours n''est pas dépassé, réactive le compte et la boutique.';

grant execute on function public.request_account_deletion(uuid) to authenticated;
grant execute on function public.cancel_account_deletion(uuid) to authenticated;
