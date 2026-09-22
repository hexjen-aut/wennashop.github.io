-- Supprimer les données de test
DELETE FROM public.myria_commandes;

-- Restructurer myria_commandes : 1 ligne = 1 client
ALTER TABLE public.myria_commandes 
  DROP COLUMN IF EXISTS parfum,
  DROP COLUMN IF EXISTS format,
  ADD COLUMN IF NOT EXISTS telephone TEXT,
  ADD COLUMN IF NOT EXISTS montant_recu NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS montant_total NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS montant_restant NUMERIC GENERATED ALWAYS AS (montant_total - montant_recu) STORED;

-- Créer la table des articles de commande
CREATE TABLE IF NOT EXISTS public.myria_commandes_items (
  id BIGSERIAL PRIMARY KEY,
  commande_id BIGINT NOT NULL REFERENCES public.myria_commandes(id) ON DELETE CASCADE,
  parfum TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT '100ml',
  quantite INT NOT NULL DEFAULT 1,
  prix_achat_mad NUMERIC DEFAULT 0,
  prix_vente_xaf NUMERIC NOT NULL,
  poids_kg NUMERIC DEFAULT 0.3,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activer realtime sur items
ALTER PUBLICATION supabase_realtime ADD TABLE public.myria_commandes_items;
