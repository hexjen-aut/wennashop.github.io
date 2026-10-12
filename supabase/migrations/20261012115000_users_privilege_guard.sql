-- Faille corrigée : la règle users_update autorise chacun à modifier SA ligne
-- sans limite de colonnes. Un compte pouvait donc se donner role = 'admin',
-- valider lui-même sa boutique (status = 'active') ou son statut de chasseur
-- (hunter_status = 'verified'). De même, l'inscription reprenait le rôle des
-- métadonnées envoyées par le navigateur (signUp(..., { data: { role } })).
--
-- Le garde ci-dessous ne s'applique qu'aux appels venant du site (rôles
-- authenticated / anon) hors admin. Les fonctions serveur (SECURITY DEFINER),
-- le service_role et l'admin ne sont pas concernés.

create or replace function public.users_guard_privileges()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') or public.get_my_role() = 'admin' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.role, 'buyer') not in ('buyer', 'artisan') then
      raise exception 'Rôle non autorisé' using errcode = '42501';
    end if;
    new.status := case when new.role = 'artisan' then 'pending' else 'active' end;
    new.hunter_status := case when new.hunter_status = 'pending_verification' then new.hunter_status end;
    new.vendor_validated_at := null;
    new.hunter_verified_at := null;
    new.hunter_referral_code := null;
    new.phone_verified := false;
    new.kyc_provider := null;
    new.kyc_purpose := null;
    new.kyc_auto_status := null;
    new.kyc_auto_reason := null;
    new.kyc_session_id := null;
    new.kyc_checked_at := null;
    return new;
  end if;

  -- Rôle : seulement acheteur <-> vendeur ; devenir vendeur repasse en attente de validation
  if new.role is distinct from old.role then
    if old.role not in ('buyer', 'artisan') or new.role not in ('buyer', 'artisan') then
      raise exception 'Changement de rôle non autorisé' using errcode = '42501';
    end if;
    if new.role = 'artisan' then new.status := 'pending'; end if;
  end if;

  -- Statut : on peut seulement redemander une validation (la suppression de compte
  -- passe par request_account_deletion, fonction serveur)
  if new.status is distinct from old.status then
    if old.status in ('banned', 'deleted') or new.status <> 'pending' then
      raise exception 'Changement de statut non autorisé' using errcode = '42501';
    end if;
  end if;

  -- Chasseur : on peut postuler (ou repostuler après un refus), pas se valider
  if new.hunter_status is distinct from old.hunter_status then
    if new.hunter_status is distinct from 'pending_verification'
       or old.hunter_status not in ('rejected') and old.hunter_status is not null then
      raise exception 'Changement de statut chasseur non autorisé' using errcode = '42501';
    end if;
  end if;

  if new.vendor_validated_at is distinct from old.vendor_validated_at
     or new.vendor_reject_reason is distinct from old.vendor_reject_reason
     or new.hunter_verified_at is distinct from old.hunter_verified_at
     or new.hunter_reject_reason is distinct from old.hunter_reject_reason
     or new.hunter_referral_code is distinct from old.hunter_referral_code
     or new.phone_verified is distinct from old.phone_verified
     or new.auth_id is distinct from old.auth_id
     or new.kyc_provider is distinct from old.kyc_provider
     or new.kyc_purpose is distinct from old.kyc_purpose
     or new.kyc_auto_status is distinct from old.kyc_auto_status
     or new.kyc_session_id is distinct from old.kyc_session_id
     or new.kyc_auto_reason is distinct from old.kyc_auto_reason
     or new.kyc_checked_at is distinct from old.kyc_checked_at then
    raise exception 'Champ réservé à l''équipe WennaShop' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Nom en « aa » : passe avant les autres déclencheurs et voit les valeurs
-- envoyées par le navigateur.
create trigger trg_users_aa_guard_privileges
  before insert or update on public.users
  for each row execute function public.users_guard_privileges();

-- Inscription : le rôle des métadonnées n'est accepté que s'il vaut buyer ou artisan
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := case when NEW.raw_user_meta_data->>'role' in ('buyer', 'artisan') then NEW.raw_user_meta_data->>'role' else 'buyer' end;
begin
  insert into public.users (
    auth_id, email, first_name, last_name, full_name, country, role, status, gender, created_at, updated_at
  ) values (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'country',
    v_role,
    case when v_role = 'artisan' then 'pending' else 'active' end,
    coalesce(NEW.raw_user_meta_data->>'gender', 'non_precise'),
    now(),
    now()
  )
  on conflict (email) do update set
    auth_id    = excluded.auth_id,
    first_name = coalesce(excluded.first_name, public.users.first_name),
    last_name  = coalesce(excluded.last_name, public.users.last_name),
    full_name  = coalesce(excluded.full_name, public.users.full_name),
    country    = coalesce(excluded.country, public.users.country),
    gender     = coalesce(excluded.gender, public.users.gender),
    updated_at = now();

  return NEW;
end;
$function$;
