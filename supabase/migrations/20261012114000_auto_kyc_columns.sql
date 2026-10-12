-- Vérification d'identité automatique (Didit) : suivi de la session et du
-- résultat sur le compte. Écrit uniquement par les fonctions kyc-start et
-- didit-webhook (service_role) ; le dépôt manuel des pièces reste possible.

alter table public.users
  add column if not exists kyc_provider text,
  add column if not exists kyc_purpose text,
  add column if not exists kyc_session_id text,
  add column if not exists kyc_auto_status text,
  add column if not exists kyc_auto_reason text,
  add column if not exists kyc_checked_at timestamptz;

alter table public.users
  add constraint users_kyc_purpose_check check (kyc_purpose is null or kyc_purpose in ('vendor', 'hunter')),
  add constraint users_kyc_auto_status_check check (kyc_auto_status is null or kyc_auto_status in ('pending', 'approved', 'declined', 'review'));

create index if not exists users_kyc_session_id on public.users (kyc_session_id) where kyc_session_id is not null;

insert into public.site_config (key, value)
values ('kyc_auto_enabled', 'false')
on conflict (key) do nothing;
