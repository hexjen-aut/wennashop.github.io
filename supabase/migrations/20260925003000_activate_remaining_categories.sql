-- Only "Énergie & Anti-délestage" (+ its 5 subcategories) was ever marked
-- active out of the full 18-root/64-sub commission-grid category tree —
-- everything else (Mode & accessoires, Électronique, Maison & cuisine,
-- Alimentation, etc.) was invisible in the vendor product-category picker
-- and the boutique category filter, even though products already exist
-- in some of them (e.g. Mode & accessoires has 3).
update public.categories set is_active = true where is_active = false;
