-- 1. Ajouter currency sur products si absent
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'MAD';

-- 2. Colonne tsvector
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- 3. Remplissage initial
UPDATE public.products
SET search_vector = to_tsvector('french',
  coalesce(name, '') || ' ' ||
  coalesce(description, '') || ' ' ||
  coalesce(country, '') || ' ' ||
  coalesce(origin_city, '')
);

-- 4. Index GIN full-text
CREATE INDEX IF NOT EXISTS idx_products_search_vector
  ON public.products USING gin(search_vector);

-- 5. Index trigram pour ilike
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_products_name_trgm
  ON public.products USING gin(name gin_trgm_ops);

-- 6. Trigger auto-update search_vector
CREATE OR REPLACE FUNCTION products_search_vector_update()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('french',
    coalesce(NEW.name, '') || ' ' ||
    coalesce(NEW.description, '') || ' ' ||
    coalesce(NEW.country, '') || ' ' ||
    coalesce(NEW.origin_city, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS products_search_vector_trigger ON public.products;
CREATE TRIGGER products_search_vector_trigger
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION products_search_vector_update();

-- 7. Fonction RPC search_products
CREATE OR REPLACE FUNCTION search_products(
  term            text    DEFAULT '',
  country_filter  text    DEFAULT NULL,
  category_filter text    DEFAULT NULL,
  price_min       numeric DEFAULT 0,
  price_max       numeric DEFAULT 999999
)
RETURNS TABLE (
  id          uuid,
  name        text,
  description text,
  price       numeric,
  currency    text,
  country     text,
  origin_city text,
  image_url   text,
  images      text[],
  category_id uuid,
  seller_id   uuid,
  status      text,
  rank        real
)
LANGUAGE sql STABLE AS $$
  SELECT
    p.id, p.name, p.description, p.price, p.currency,
    p.country, p.origin_city, p.image_url, p.images,
    p.category_id, p.seller_id, p.status,
    CASE
      WHEN trim(term) = '' THEN 1.0
      ELSE ts_rank(p.search_vector, websearch_to_tsquery('french', term))
    END AS rank
  FROM public.products p
  WHERE
    p.status = 'active'
    AND p.price BETWEEN price_min AND price_max
    AND (country_filter IS NULL OR p.country = country_filter)
    AND (category_filter IS NULL OR p.category_id::text = category_filter)
    AND (
      trim(term) = ''
      OR p.search_vector @@ websearch_to_tsquery('french', term)
      OR p.name ILIKE '%' || term || '%'
    )
  ORDER BY rank DESC, p.created_at DESC;
$$;
