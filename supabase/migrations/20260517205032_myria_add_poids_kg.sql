-- Ajouter poids_kg à myria_produits (défaut 0.3 kg par flacon)
ALTER TABLE public.myria_produits 
  ADD COLUMN IF NOT EXISTS poids_kg NUMERIC DEFAULT 0.3;

-- Ajouter poids_kg à myria_envois (calculé par poids réel)
ALTER TABLE public.myria_envois 
  ADD COLUMN IF NOT EXISTS poids_kg NUMERIC DEFAULT 1;

-- Mettre à jour les produits existants avec un poids estimé selon le format
UPDATE public.myria_produits SET poids_kg = 
  CASE 
    WHEN format = '12ml'  THEN 0.1
    WHEN format = '30ml'  THEN 0.15
    WHEN format = '50ml'  THEN 0.2
    WHEN format = '100ml' THEN 0.35
    ELSE 0.3
  END
WHERE poids_kg = 0.3 OR poids_kg IS NULL;
