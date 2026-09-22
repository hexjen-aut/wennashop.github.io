-- Table wallet vendeur (solde disponible)
CREATE TABLE IF NOT EXISTS public.vendor_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  balance numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'MAD',
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- Historique des transactions wallet (recharges, retraits, commissions)
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('credit','debit','commission','refund')),
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'MAD',
  description text,
  reference text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','failed')),
  created_at timestamptz DEFAULT now()
);

-- Ajouter colonnes manquantes sur payments si pas déjà présentes
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS type text DEFAULT 'order_payment' CHECK (type IN ('order_payment','wallet_topup','vendor_payout')),
  ADD COLUMN IF NOT EXISTS cinetpay_token text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Index perf
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_transaction_id ON public.payments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id ON public.wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_vendor_wallets_user_id ON public.vendor_wallets(user_id);

-- RLS
ALTER TABLE public.vendor_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_wallet_select" ON public.vendor_wallets;
CREATE POLICY "user_wallet_select" ON public.vendor_wallets FOR SELECT USING (user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

DROP POLICY IF EXISTS "user_wallet_transactions_select" ON public.wallet_transactions;
CREATE POLICY "user_wallet_transactions_select" ON public.wallet_transactions FOR SELECT USING (user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));
