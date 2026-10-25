-- Variantes : chaque vendeur nomme ses deux options (« Parfum », « Poids »,
-- « Pointure »…). La première correspond à product_variants.color, la
-- seconde à product_variants.size. Sans nom, la fiche garde « Coloris » et
-- « Taille » (variantes déjà en place de la boutique officielle).
alter table public.products
  add column if not exists option1_name text,
  add column if not exists option2_name text;

alter table public.products
  add constraint products_option1_name_len check (option1_name is null or char_length(option1_name) between 1 and 30),
  add constraint products_option2_name_len check (option2_name is null or char_length(option2_name) between 1 and 30);
