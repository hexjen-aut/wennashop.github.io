-- "Services" (root) and its 3 children (Click & Collect, Livraison express,
-- Retours & échanges) describe platform/shipping features, not a product
-- family. Confirmed 0 products ever assigned to any of the four rows, and
-- no code references their ids or names outside the migrations that
-- originally seeded them. Safe to drop outright.
delete from public.categories where id in (
  '182ab497-b68a-417e-916c-fbb0f059fe6a', -- Click & Collect
  'dda0ef49-8b42-4d55-92a1-d2f4ff9efea3', -- Livraison express
  '60af6b2a-ffce-4311-916a-0dbc3f5fa15f', -- Retours & échanges
  'b1733a93-fa34-4293-a122-6fda42de8625'  -- Services (root)
);
