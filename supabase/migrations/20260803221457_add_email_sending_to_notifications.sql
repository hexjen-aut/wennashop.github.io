-- Active l'extension qui permet à la base de données d'appeler le programme d'envoi
create extension if not exists pg_net with schema extensions;

-- Ajoute une trace : à quel moment l'email a été envoyé (null = pas encore envoyé)
alter table public.notifications
  add column if not exists email_sent_at timestamptz,
  add column if not exists email_error text;

-- Fonction qui appelle le programme d'envoi dès qu'une notification est créée
create or replace function public.trigger_send_notification_email()
returns trigger
language plpgsql
security definer
as $$
begin
  perform net.http_post(
    url := 'https://aakxoydznmybstfozjte.supabase.co/functions/v1/send-notification-email',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := jsonb_build_object('notification_id', NEW.id)
  );
  return new;
end;
$$;

drop trigger if exists trg_send_notification_email on public.notifications;
create trigger trg_send_notification_email
after insert on public.notifications
for each row execute function public.trigger_send_notification_email();
