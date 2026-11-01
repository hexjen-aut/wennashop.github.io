-- « Notifications activées » (type push_test) : envoyée juste après « Activer »
-- pour montrer que l'appareil reçoit bien. Seulement en notification, pas par
-- e-mail.
create or replace function public.trigger_send_notification_email()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.type = 'push_test' then return new; end if;
  perform net.http_post(
    url := 'https://aakxoydznmybstfozjte.supabase.co/functions/v1/send-notification-email',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := jsonb_build_object('notification_id', new.id)
  );
  return new;
end;
$function$;
