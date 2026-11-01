-- Messages de l'équipe (admin → utilisateurs) : une notification par
-- destinataire (cloche du site + téléphone si les notifications push sont
-- activées), et par e-mail si l'admin le choisit. Historique des envois.

create table if not exists public.admin_broadcasts (
  id uuid primary key default gen_random_uuid(),
  sent_by uuid references public.users(id) on delete set null,
  title text not null,
  body text,
  link text,
  audience_role text not null default 'all',
  audience_country text not null default 'all',
  audience_user_id uuid references public.users(id) on delete set null,
  send_email boolean not null default true,
  recipients integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.admin_broadcasts enable row level security;
drop policy if exists admin_broadcasts_admin_read on public.admin_broadcasts;
create policy admin_broadcasts_admin_read on public.admin_broadcasts
  for select using (public.get_my_role() = 'admin');

-- Destinataires : comptes actifs, filtrés par rôle et pays, ou une personne.
-- Rôles : all, buyer (acheteurs), seller (vendeurs), hunter (chasseurs
-- vérifiés), team (admins et agents de paiement).
create or replace function public.broadcast_recipients(
  p_role text, p_country text, p_user_id uuid
) returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select u.id from public.users u
  where coalesce(u.status, 'active') = 'active'
    and (p_user_id is null or u.id = p_user_id)
    and (p_user_id is not null or coalesce(p_country, 'all') = 'all' or u.country = p_country)
    and (p_user_id is not null or case coalesce(p_role, 'all')
      when 'all' then true
      when 'buyer' then u.role = 'buyer'
      when 'seller' then u.role = 'artisan'
      when 'hunter' then u.hunter_status = 'verified'
      when 'team' then u.role = 'admin' or exists (
        select 1 from public.staff_roles r where r.user_id = u.id and r.role = 'payment_agent')
      else false end)
$$;
revoke all on function public.broadcast_recipients(text, text, uuid) from public, anon, authenticated;

-- p_dry_run : renvoie seulement le nombre de destinataires (aperçu avant envoi).
create or replace function public.admin_broadcast(
  p_title text, p_body text, p_link text default null,
  p_role text default 'all', p_country text default 'all', p_user_id uuid default null,
  p_send_email boolean default true, p_dry_run boolean default false
) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_body text := nullif(trim(coalesce(p_body, '')), '');
  v_link text := nullif(trim(coalesce(p_link, '')), '');
  v_count integer;
begin
  if public.get_my_role() is distinct from 'admin' then raise exception 'forbidden'; end if;
  if coalesce(p_role, 'all') not in ('all', 'buyer', 'seller', 'hunter', 'team') then raise exception 'invalid_role'; end if;

  select count(*) into v_count from public.broadcast_recipients(p_role, p_country, p_user_id);
  if p_dry_run then return v_count; end if;

  if v_title is null or length(v_title) > 80 then raise exception 'invalid_title'; end if;
  if length(coalesce(v_body, '')) > 400 then raise exception 'body_too_long'; end if;
  if v_link is not null and v_link !~ '^/[^/]' and v_link <> '/' then raise exception 'invalid_link'; end if;
  if v_count = 0 then raise exception 'no_recipient'; end if;

  insert into public.notifications (user_id, type, title, body, link)
  select r, case when p_send_email then 'broadcast' else 'broadcast_quiet' end, v_title, v_body, v_link
  from public.broadcast_recipients(p_role, p_country, p_user_id) r;

  insert into public.admin_broadcasts (sent_by, title, body, link, audience_role, audience_country, audience_user_id, send_email, recipients)
  values (public.my_user_id(), v_title, v_body, v_link, coalesce(p_role, 'all'), coalesce(p_country, 'all'), p_user_id, p_send_email, v_count);

  return v_count;
end $$;
revoke all on function public.admin_broadcast(text, text, text, text, text, uuid, boolean, boolean) from public, anon;
grant execute on function public.admin_broadcast(text, text, text, text, text, uuid, boolean, boolean) to authenticated;

-- Pas d'e-mail pour la confirmation d'activation ni pour un message envoyé
-- « sans e-mail ».
create or replace function public.trigger_send_notification_email()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.type in ('push_test', 'broadcast_quiet') then return new; end if;
  perform net.http_post(
    url := 'https://aakxoydznmybstfozjte.supabase.co/functions/v1/send-notification-email',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := jsonb_build_object('notification_id', new.id)
  );
  return new;
end;
$function$;
