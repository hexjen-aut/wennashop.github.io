-- ============================================================
-- 1. Fournisseurs de paiement (Moov, Airtel via Moneroo, Stripe, SingPay, manuel...)
-- ============================================================
create table public.payment_providers (
  code text primary key,
  name text not null,
  kind text not null check (kind in ('direct_operator','aggregator','card_psp','manual')),
  supports_collect boolean not null default true,
  supports_payout boolean not null default false,
  status text not null default 'PLANNED' check (status in ('PLANNED','BETA','ACTIVE','PAUSED','SUSPENDED')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.payment_providers is 'Fournisseurs techniques derrière les moyens de paiement (Moov, Moneroo, Stripe, SingPay, manuel). status contrôle si le fournisseur est réellement utilisable.';

-- ============================================================
-- 2. Moyens de paiement visibles par le client au moment de payer
-- ============================================================
create table public.payment_methods (
  code text primary key,
  name text not null,
  provider_code text not null references public.payment_providers(code),
  status text not null default 'PLANNED' check (status in ('PLANNED','BETA','ACTIVE','PAUSED','SUSPENDED')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.payment_methods is 'Moyens de paiement proposés au client (Moov Money, Airtel Money, carte, paiement à la livraison).';

-- ============================================================
-- 3. Quels moyens de paiement sont activés dans quel pays (interrupteur du tableau de bord)
-- ============================================================
create table public.country_payment_methods (
  country_code text not null references public.countries(code),
  payment_method_code text not null references public.payment_methods(code),
  is_enabled boolean not null default false,
  fee_percent numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (country_code, payment_method_code)
);

comment on table public.country_payment_methods is 'Active ou désactive un moyen de paiement pour un pays donné, sans toucher au code. is_enabled=false tant que le fournisseur n''est pas réellement opérationnel dans ce pays.';

-- ============================================================
-- 4. Rattacher un paiement au moyen choisi (garde les colonnes existantes provider/method en texte libre pour compatibilité)
-- ============================================================
alter table public.payments
  add column if not exists payment_method_code text references public.payment_methods(code);

-- ============================================================
-- 5. Rattacher un mouvement de portefeuille vendeur à la commande et à la boutique concernées
-- ============================================================
alter table public.wallet_transactions
  add column if not exists order_id uuid references public.orders(id),
  add column if not exists shop_id uuid references public.shops(id);

comment on column public.wallet_transactions.order_id is 'Commande à l''origine du crédit/débit (commission, part vendeur).';
comment on column public.wallet_transactions.shop_id is 'Boutique concernée par ce mouvement de portefeuille.';

-- ============================================================
-- 6. Demandes de retrait vendeur (payout)
-- ============================================================
create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  shop_id uuid references public.shops(id),
  amount numeric not null check (amount > 0),
  currency text not null default 'XAF',
  payment_method_code text references public.payment_methods(code),
  recipient_phone text,
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED','PAID','FAILED')),
  admin_note text,
  wallet_transaction_id uuid references public.wallet_transactions(id),
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.payouts is 'Demande de retrait d''un vendeur vers Moov Money / Airtel Money / etc. Validée par un admin avant paiement réel.';

-- ============================================================
-- RLS
-- ============================================================
alter table public.payment_providers enable row level security;
alter table public.payment_methods enable row level security;
alter table public.country_payment_methods enable row level security;
alter table public.payouts enable row level security;

-- Lecture publique des tables de configuration (le checkout doit pouvoir lire ce qui est activé)
create policy "payment_providers_read_all" on public.payment_providers for select using (true);
create policy "payment_providers_admin_write" on public.payment_providers for insert with check (get_my_role() = 'admin');
create policy "payment_providers_admin_update" on public.payment_providers for update using (get_my_role() = 'admin');
create policy "payment_providers_admin_delete" on public.payment_providers for delete using (get_my_role() = 'admin');

create policy "payment_methods_read_all" on public.payment_methods for select using (true);
create policy "payment_methods_admin_write" on public.payment_methods for insert with check (get_my_role() = 'admin');
create policy "payment_methods_admin_update" on public.payment_methods for update using (get_my_role() = 'admin');
create policy "payment_methods_admin_delete" on public.payment_methods for delete using (get_my_role() = 'admin');

create policy "country_payment_methods_read_all" on public.country_payment_methods for select using (true);
create policy "country_payment_methods_admin_write" on public.country_payment_methods for insert with check (get_my_role() = 'admin');
create policy "country_payment_methods_admin_update" on public.country_payment_methods for update using (get_my_role() = 'admin');
create policy "country_payment_methods_admin_delete" on public.country_payment_methods for delete using (get_my_role() = 'admin');

-- payouts : le vendeur voit et crée ses propres demandes ; seul l'admin les modifie (validation/refus/paiement)
create policy "payouts_select" on public.payouts for select using (
  (user_id in (select users.id from users where users.auth_id = (select auth.uid())))
  or (get_my_role() = 'admin')
);
create policy "payouts_insert" on public.payouts for insert with check (
  (user_id in (select users.id from users where users.auth_id = (select auth.uid())))
  or (get_my_role() = 'admin')
);
create policy "payouts_update_admin" on public.payouts for update using (get_my_role() = 'admin');

-- ============================================================
-- 7. Données de départ (fournisseurs et moyens connus aujourd'hui)
-- ============================================================
insert into public.payment_providers (code, name, kind, supports_collect, supports_payout, status, notes) values
  ('moov_gabon', 'Moov Money Online (Gabon)', 'direct_operator', true, false, 'PLANNED', 'Compte marchand à ouvrir auprès de Moov Africa Gabon Telecom (procédure officielle, ~48h).'),
  ('moneroo', 'Moneroo', 'aggregator', true, true, 'PLANNED', 'Agrégateur couvrant Airtel Money Gabon et Moov Money Gabon en une seule intégration, avec API de retrait vendeur. À tester en bac à sable avant activation.'),
  ('cinetpay', 'CinetPay', 'aggregator', true, false, 'PLANNED', 'Le Gabon ne fait pas partie de la liste officielle des pays couverts par CinetPay au moment de la vérification. Ne pas activer pour le Gabon sans confirmation écrite de CinetPay.'),
  ('stripe', 'Stripe', 'card_psp', true, false, 'ACTIVE', 'Déjà utilisé pour les paiements par carte.'),
  ('singpay', 'SingPay', 'aggregator', true, false, 'ACTIVE', 'Déjà utilisé (colonnes singpay_token/singpay_ref existantes sur payments).'),
  ('manual', 'Paiement / retrait manuel', 'manual', true, true, 'ACTIVE', 'Solution de secours validée à la main par un admin, en attendant l''automatisation.')
on conflict (code) do nothing;

insert into public.payment_methods (code, name, provider_code, status, sort_order) values
  ('moov_money', 'Moov Money', 'moov_gabon', 'PLANNED', 10),
  ('airtel_money', 'Airtel Money', 'moneroo', 'PLANNED', 20),
  ('card', 'Carte bancaire', 'stripe', 'ACTIVE', 30),
  ('cash_on_delivery', 'Paiement à la livraison', 'manual', 'PLANNED', 40)
on conflict (code) do nothing;

insert into public.country_payment_methods (country_code, payment_method_code, is_enabled) values
  ('GA', 'moov_money', false),
  ('GA', 'airtel_money', false),
  ('GA', 'card', false),
  ('GA', 'cash_on_delivery', false),
  ('MA', 'card', true)
on conflict (country_code, payment_method_code) do nothing;
