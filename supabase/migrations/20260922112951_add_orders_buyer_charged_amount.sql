ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS buyer_total_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS buyer_currency text;

COMMENT ON COLUMN public.orders.total_amount IS 'Montant dans la devise du VENDEUR (référence commission/payout) — jamais la devise affichée à l''acheteur.';
COMMENT ON COLUMN public.orders.buyer_total_amount IS 'Montant réellement facturé à l''acheteur, converti + marge de sécurité (voir src/lib/currency.js). Utilisé uniquement côté paiement/acheteur.';
