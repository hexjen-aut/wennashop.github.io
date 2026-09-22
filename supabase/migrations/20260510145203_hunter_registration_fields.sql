-- Champs supplémentaires pour l'inscription chasseur
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone             text,
  ADD COLUMN IF NOT EXISTS phone_verified    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS city              text,
  ADD COLUMN IF NOT EXISTS id_card_front_url text,
  ADD COLUMN IF NOT EXISTS id_card_back_url  text,
  ADD COLUMN IF NOT EXISTS hunter_status     text DEFAULT NULL,
  -- hunter_status : NULL (pas chasseur) | pending_verification | active | rejected
  ADD COLUMN IF NOT EXISTS hunter_payout_method  text DEFAULT NULL,
  -- hunter_payout_method : mobile_money_gabon | virement | card_maroc
  ADD COLUMN IF NOT EXISTS hunter_payout_details jsonb DEFAULT NULL,
  -- ex: { "number": "+241 06 00 00 00", "operator": "Airtel" }
  --     { "rib": "000...", "bank": "Attijari" }
  ADD COLUMN IF NOT EXISTS hunter_applied_at  timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS hunter_verified_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS hunter_reject_reason text DEFAULT NULL;

-- Index pour les admins qui filtrent par statut
CREATE INDEX IF NOT EXISTS idx_users_hunter_status ON users(hunter_status);

-- RLS : un user peut lire/mettre à jour ses propres champs chasseur
-- (les policies existantes couvrent déjà ça via auth_id = auth.uid())
