-- E-mails des messages de l'équipe : Resend accepte 10 envois par seconde. Un
-- message à beaucoup d'utilisateurs ne part donc plus d'un coup par le trigger :
-- une tâche passe chaque minute et envoie 8 e-mails à la fois, 3 essais au plus.

alter table public.notifications add column if not exists email_attempts integer not null default 0;

create or replace function public.trigger_send_notification_email()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.type in ('push_test', 'broadcast_quiet', 'broadcast') then return new; end if;
  perform net.http_post(
    url := 'https://aakxoydznmybstfozjte.supabase.co/functions/v1/send-notification-email',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := jsonb_build_object('notification_id', new.id)
  );
  return new;
end;
$function$;

create or replace function public.send_pending_broadcast_emails()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare v_ids uuid[];
begin
  with picked as (
    select id from public.notifications
    where type = 'broadcast' and email_sent_at is null and email_attempts < 3
      and created_at > now() - interval '2 days'
    order by created_at
    limit 8
    for update skip locked
  ), upd as (
    update public.notifications n set email_attempts = n.email_attempts + 1
    from picked where n.id = picked.id
    returning n.id
  )
  select array_agg(id) into v_ids from upd;

  perform net.http_post(
    url := 'https://aakxoydznmybstfozjte.supabase.co/functions/v1/send-notification-email',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('notification_id', i)
  ) from unnest(coalesce(v_ids, '{}')) i;

  return coalesce(array_length(v_ids, 1), 0);
end $$;
revoke all on function public.send_pending_broadcast_emails() from public, anon, authenticated;

select cron.unschedule('broadcast-emails') where exists (select 1 from cron.job where jobname = 'broadcast-emails');
select cron.schedule('broadcast-emails', '* * * * *', 'select public.send_pending_broadcast_emails()');
