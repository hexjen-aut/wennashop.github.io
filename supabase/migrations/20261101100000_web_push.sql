-- Notifications push (Web Push) : la notification arrive sur le téléphone ou
-- l'ordinateur même quand WennaShop est fermé. Chaque appareil autorisé a une
-- ligne dans push_subscriptions ; à chaque nouvelle ligne de notifications, la
-- fonction send-push l'envoie à tous les appareils de l'utilisateur.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
drop policy if exists push_sub_select_own on public.push_subscriptions;
create policy push_sub_select_own on public.push_subscriptions
  for select using (user_id = public.my_user_id());

-- Écriture seulement par ces deux fonctions : un même navigateur peut changer
-- de compte, l'abonnement suit alors le compte connecté.
create or replace function public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_me uuid := public.my_user_id();
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if coalesce(p_endpoint, '') !~ '^https://' or length(p_endpoint) > 1000
     or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'invalid_subscription';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (v_me, p_endpoint, left(p_p256dh, 200), left(p_auth, 100), left(p_user_agent, 300))
  on conflict (endpoint) do update set
    user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
    user_agent = excluded.user_agent, created_at = now();
end $$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = public.my_user_id();
$$;

revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
revoke all on function public.delete_push_subscription(text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;

-- Clé VAPID privée : rangée dans vault (secret « vapid_private_key », jamais
-- dans le dépôt), lue seulement par send-push avec la clé service_role.
create or replace function public.get_vapid_private_key()
returns text
language sql security definer set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private_key' limit 1;
$$;
revoke all on function public.get_vapid_private_key() from public, anon, authenticated;
grant execute on function public.get_vapid_private_key() to service_role;

-- push_sent_at : send-push ne renvoie jamais deux fois la même notification.
alter table public.notifications add column if not exists push_sent_at timestamptz;

create or replace function public.trigger_send_notification_push()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.push_subscriptions where user_id = new.user_id) then
    perform net.http_post(
      url := 'https://aakxoydznmybstfozjte.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('notification_id', new.id)
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_send_notification_push on public.notifications;
create trigger trg_send_notification_push
  after insert on public.notifications
  for each row execute function public.trigger_send_notification_push();

-- Acheteur : commande confirmée. Le paiement vérifié par un agent a déjà son
-- message (« Paiement validé », review_payment) ; ici, paiement à la livraison
-- et paiement automatique (Airtel).
create or replace function public.notify_buyer_order_confirmed()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.status = 'pending' and new.status = 'processing' and new.user_id is not null
     and not exists (
       select 1 from public.payments p
       where p.order_id = new.id and p.verification_status = 'validated'
     ) then
    insert into public.notifications (user_id, type, title, body, link)
    values (new.user_id, 'order',
      'Commande confirmée — ' || public.order_payment_reference(new.id),
      'Le vendeur prépare ta commande. Tu seras prévenu dès l''expédition.',
      '/commande/' || new.id);
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_buyer_order_confirmed on public.orders;
create trigger trg_notify_buyer_order_confirmed
  after update of status on public.orders
  for each row execute function public.notify_buyer_order_confirmed();

-- Chasseurs vérifiés : nouvelle quête dans leur pays.
create or replace function public.notify_hunters_new_quest()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'open' and new.country_target is not null then
    insert into public.notifications (user_id, type, title, body, link)
    select u.id, 'quest_new',
      'Nouvelle quête : ' || left(new.title, 60),
      'Récompense ' || round(coalesce(new.reward_amount, 0))::text || ' ' || coalesce(new.currency, '')
        || ' · produit à trouver au ' || new.country_target || '.',
      '/chasseur'
    from public.users u
    where u.hunter_status = 'verified'
      and u.country = new.country_target
      and u.id is distinct from new.buyer_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_hunters_new_quest on public.quests;
create trigger trg_notify_hunters_new_quest
  after insert on public.quests
  for each row execute function public.notify_hunters_new_quest();
