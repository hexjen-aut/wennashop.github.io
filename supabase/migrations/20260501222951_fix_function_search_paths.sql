-- ÉTAPE 4 : Fixer search_path sur toutes les fonctions concernées

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE auth_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_quest_expires_at()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
BEGIN
  NEW.expires_at := NEW.created_at + (NEW.duration_days || ' days')::INTERVAL;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_quests()
RETURNS void
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
BEGIN
  UPDATE quests SET status = 'expired'
  WHERE status = 'open' AND expires_at < now();
END;
$$;

CREATE OR REPLACE FUNCTION public.products_search_vector_update()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
BEGIN
  NEW.search_vector := to_tsvector('french',
    coalesce(NEW.name, '') || ' ' ||
    coalesce(NEW.description, '') || ' ' ||
    coalesce(NEW.country, '') || ' ' ||
    coalesce(NEW.origin_city, '')
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.search_products(
  term text DEFAULT '',
  country_filter text DEFAULT NULL,
  category_filter text DEFAULT NULL,
  price_min numeric DEFAULT 0,
  price_max numeric DEFAULT 999999
)
RETURNS TABLE(
  id uuid, name text, description text, price numeric, currency text,
  country text, origin_city text, image_url text, images text[],
  category_id uuid, seller_id uuid, status text, rank real
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
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

CREATE OR REPLACE FUNCTION public.generate_tracking_number()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
BEGIN
  IF NEW.tracking_number IS NULL THEN
    NEW.tracking_number := 'WNS-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(NEW.id::text, 1, 4));
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_order_status_from_delivery()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  mapped_status TEXT;
BEGIN
  mapped_status := CASE NEW.status
    WHEN 'picked_up'        THEN 'picked_up'
    WHEN 'in_transit'       THEN 'in_transit'
    WHEN 'out_for_delivery' THEN 'out_for_delivery'
    WHEN 'delivered'        THEN 'delivered'
    WHEN 'failed'           THEN 'pending'
    WHEN 'returned'         THEN 'returned'
    WHEN 'cancelled'        THEN 'cancelled'
    ELSE NULL
  END;

  IF mapped_status IS NOT NULL THEN
    UPDATE orders
    SET status = mapped_status,
        updated_at = NOW()
    WHERE id = NEW.order_id;
  END IF;

  RETURN NEW;
END;
$$;
