-- 1. Extension unaccent
CREATE EXTENSION IF NOT EXISTS unaccent;

-- 2. Corriger fn_auto_create_shop avec le champ name obligatoire
CREATE OR REPLACE FUNCTION fn_auto_create_shop()
RETURNS TRIGGER AS $$
DECLARE
  slug_base text;
  final_slug text;
  shop_name text;
  counter int := 0;
BEGIN
  -- Nom de la boutique par défaut
  shop_name := coalesce(NEW.full_name, split_part(NEW.email, '@', 1), 'Boutique');
  
  -- Génération du slug sans dépendance à unaccent
  slug_base := lower(regexp_replace(shop_name, '[^a-zA-Z0-9]+', '-', 'g'));
  slug_base := trim(both '-' from slug_base);
  IF slug_base = '' THEN slug_base := 'boutique'; END IF;
  final_slug := slug_base;

  -- Éviter les doublons de slug
  WHILE EXISTS (SELECT 1 FROM public.shops WHERE slug = final_slug) LOOP
    counter := counter + 1;
    final_slug := slug_base || '-' || counter;
  END LOOP;

  -- Créer la boutique avec name + slug
  INSERT INTO public.shops (user_id, name, slug, created_at, updated_at)
  VALUES (NEW.id, shop_name, final_slug, now(), now())
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Insérer les profils manquants
INSERT INTO public.users (auth_id, email, role, status, created_at, updated_at)
SELECT 
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'role', 'artisan') as role,
  'active' as status,
  u.created_at,
  now()
FROM auth.users u
LEFT JOIN public.users p ON p.auth_id = u.id
WHERE p.auth_id IS NULL
ON CONFLICT (email) DO UPDATE SET
  auth_id = EXCLUDED.auth_id,
  status = 'active',
  updated_at = now();
