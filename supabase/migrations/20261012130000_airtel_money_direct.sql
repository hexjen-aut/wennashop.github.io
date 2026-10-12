-- Airtel Money Gabon en direct (API Airtel Africa) : 3e fournisseur possible
-- pour le moyen « airtel_money », à côté de SingPay et pawaPay (choix dans
-- l'admin, section Pays). Les fonctions airtel-kyc / airtel-collect /
-- airtel-callback / airtel-status écrivent seules dans payments (service_role).

insert into public.payment_providers (code, name, kind, supports_collect, supports_payout, status, notes)
values (
  'airtel', 'Airtel Money (direct)', 'direct_operator', true, true, 'PLANNED',
  'API Airtel Africa, Gabon (GA / XAF). Secrets AIRTEL_* dans Supabase ; callback : /functions/v1/airtel-callback.'
)
on conflict (code) do nothing;

-- ── payments : champs du paiement Airtel ───────────────────────────
-- Le statut reste celui du site (pending / paid / failed / refunded) ; un
-- paiement sans réponse après 15 min passe en failed avec status_code TE.
alter table public.payments
  add column if not exists reference text,
  add column if not exists msisdn text,
  add column if not exists country text,
  add column if not exists airtel_money_id text,
  add column if not exists status_code text,
  add column if not exists provider_message text,
  add column if not exists raw_request jsonb,
  add column if not exists raw_callback jsonb;

create unique index if not exists payments_reference_key on public.payments (reference) where reference is not null;
create index if not exists payments_provider_status on public.payments (provider, status, created_at);

-- Les paiements ne sont écrits que côté serveur : la règle qui laissait un
-- utilisateur connecté créer ses propres lignes est neutralisée.
alter policy payments_insert_service on public.payments with check (false);

-- Suivi en direct du statut par l'acheteur (RLS payments_select : ses lignes)
alter publication supabase_realtime add table public.payments;

-- ── Cache du jeton OAuth Airtel (aucun accès client) ───────────────
create table if not exists public.airtel_tokens (
  id int primary key check (id = 1),
  access_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.airtel_tokens enable row level security;
revoke all on public.airtel_tokens from anon, authenticated;

-- ── Phase 2 (décaissements vendeurs) : structure seulement ─────────
alter table public.payouts
  add column if not exists provider text,
  add column if not exists reference text,
  add column if not exists provider_txn_id text,
  add column if not exists status_code text,
  add column if not exists provider_message text,
  add column if not exists kyc_name text,
  add column if not exists raw_response jsonb;
create unique index if not exists payouts_reference_key on public.payouts (reference) where reference is not null;

-- ── Relance automatique des paiements en attente (toutes les 2 min) ─
-- airtel-status (mode « sweep ») interroge Airtel pour les paiements en
-- attente depuis plus de 2 min et clôt ceux restés sans réponse 15 min.
-- Il s'authentifie avec un secret généré ici et rangé dans le coffre (vault).
select vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'airtel_cron_secret', 'Appel de airtel-status par pg_cron');

create or replace function public.airtel_cron_secret_valid(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_secret, '') <> '' and exists (
    select 1 from vault.decrypted_secrets where name = 'airtel_cron_secret' and decrypted_secret = p_secret
  )
$$;
revoke all on function public.airtel_cron_secret_valid(text) from public, anon, authenticated;
grant execute on function public.airtel_cron_secret_valid(text) to service_role;

select cron.schedule(
  'airtel-payments-sweep',
  '*/2 * * * *',
  $cron$
  select net.http_post(
    url := 'https://aakxoydznmybstfozjte.supabase.co/functions/v1/airtel-status',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'airtel_cron_secret')
    ),
    body := '{"sweep": true}'::jsonb,
    timeout_milliseconds := 20000
  )
  where exists (
    select 1 from public.payments
    where provider = 'airtel' and status = 'pending' and updated_at < now() - interval '2 minutes'
  );
  $cron$
);
