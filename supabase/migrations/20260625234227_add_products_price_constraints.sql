-- ============================================================
-- PATCH 4 : Contraintes DB sur les produits
-- Prix positif + plafond + nom non vide
-- ============================================================
ALTER TABLE public.products 
  ADD CONSTRAINT products_price_positive 
    CHECK (price > 0),
  ADD CONSTRAINT products_price_max 
    CHECK (price < 100000000),
  ADD CONSTRAINT products_name_not_empty 
    CHECK (length(trim(name)) > 0);
