-- ═══════════════════════════════════════════════════════
-- 1. Bucket Storage "products" pour les images
-- ═══════════════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'products',
  'products',
  true,                          -- public = URLs directes sans auth
  5242880,                       -- 5 MB max par image
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════
-- 2. RLS Storage — upload uniquement si authentifié
-- ═══════════════════════════════════════════════════════
DROP POLICY IF EXISTS "products_storage_upload" ON storage.objects;
CREATE POLICY "products_storage_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'products'
    AND auth.uid() IS NOT NULL
  );

-- Lecture publique
DROP POLICY IF EXISTS "products_storage_read" ON storage.objects;
CREATE POLICY "products_storage_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'products');

-- Suppression = owner uniquement
DROP POLICY IF EXISTS "products_storage_delete" ON storage.objects;
CREATE POLICY "products_storage_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'products'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ═══════════════════════════════════════════════════════
-- 3. RLS products — insert par vendeur authentifié
-- ═══════════════════════════════════════════════════════
DROP POLICY IF EXISTS "products_insert_seller" ON public.products;
CREATE POLICY "products_insert_seller" ON public.products
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND seller_id = (
      SELECT id FROM public.users WHERE auth_id = auth.uid() LIMIT 1
    )
  );

-- Update = vendeur owner
DROP POLICY IF EXISTS "products_update_seller" ON public.products;
CREATE POLICY "products_update_seller" ON public.products
  FOR UPDATE USING (
    seller_id = (
      SELECT id FROM public.users WHERE auth_id = auth.uid() LIMIT 1
    )
  );
