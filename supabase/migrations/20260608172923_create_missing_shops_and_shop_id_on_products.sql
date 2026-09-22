-- 1. Créer les boutiques manquantes pour les 3 vendeurs existants
INSERT INTO shops (id, user_id, name, slug, status, is_verified, created_at, updated_at)
VALUES
  (
    gen_random_uuid(),
    '5681fafa-91e7-4e0a-a614-1fd840469c1e',
    'Boutique Lord Sanemi',
    'boutique-lord-sanemi',
    'active',
    true,
    now(),
    now()
  ),
  (
    gen_random_uuid(),
    'a8832080-cbd6-4eb8-8a8d-86adda40202b',
    'Boutique Sanemi San',
    'boutique-sanemi-san',
    'active',
    false,
    now(),
    now()
  ),
  (
    gen_random_uuid(),
    'd8a43d53-5575-4aa2-bcf5-f490162a473c',
    'Boutique Michel Eyeghe',
    'boutique-michel-eyeghe',
    'active',
    false,
    now(),
    now()
  )
ON CONFLICT DO NOTHING;

-- 2. Ajouter shop_id sur products (nullable pour l'instant, on remplit ensuite)
ALTER TABLE products ADD COLUMN IF NOT EXISTS shop_id uuid REFERENCES shops(id) ON DELETE SET NULL;

-- 3. Remplir shop_id pour tous les produits existants via seller_id → shops.user_id
UPDATE products p
SET shop_id = s.id
FROM shops s
WHERE s.user_id = p.seller_id
  AND p.shop_id IS NULL;

-- 4. Créer un trigger : à chaque INSERT de produit, remplir shop_id automatiquement
CREATE OR REPLACE FUNCTION fn_set_product_shop_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.shop_id IS NULL AND NEW.seller_id IS NOT NULL THEN
    SELECT id INTO NEW.shop_id
    FROM shops
    WHERE user_id = NEW.seller_id
      AND status = 'active'
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_product_shop_id ON products;
CREATE TRIGGER trg_set_product_shop_id
  BEFORE INSERT OR UPDATE OF seller_id ON products
  FOR EACH ROW EXECUTE FUNCTION fn_set_product_shop_id();

-- 5. Créer un trigger : à chaque INSERT user avec role vendeur, créer la boutique automatiquement
CREATE OR REPLACE FUNCTION fn_auto_create_shop()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  slug_base text;
  slug_final text;
  n int := 0;
BEGIN
  -- Déclenche seulement si le rôle est vendeur/artisan
  IF NEW.role IN ('vendor', 'seller', 'artisan', 'vendeur') THEN
    slug_base := lower(regexp_replace(
      unaccent(coalesce(NEW.full_name, NEW.email)),
      '[^a-z0-9]+', '-', 'g'
    ));
    slug_final := slug_base;
    -- Anti-collision slug
    LOOP
      EXIT WHEN NOT EXISTS (SELECT 1 FROM shops WHERE slug = slug_final);
      n := n + 1;
      slug_final := slug_base || '-' || n;
    END LOOP;
    INSERT INTO shops (id, user_id, name, slug, status, is_verified, created_at, updated_at)
    VALUES (
      gen_random_uuid(),
      NEW.id,
      coalesce(NEW.full_name, 'Boutique ' || split_part(NEW.email, '@', 1)),
      slug_final,
      'active',
      false,
      now(),
      now()
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_create_shop ON users;
CREATE TRIGGER trg_auto_create_shop
  AFTER INSERT OR UPDATE OF role ON users
  FOR EACH ROW EXECUTE FUNCTION fn_auto_create_shop();
