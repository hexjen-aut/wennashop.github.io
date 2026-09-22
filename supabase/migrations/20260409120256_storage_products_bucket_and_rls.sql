-- ═══════════════════════════════════════════════════════
-- 1. Bucket "products" pour les images vendeurs
-- ═══════════════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'products',
  'products',
  true,                          -- images accessibles publiquement
  5242880,                       -- 5 MB max par fichier
  ARRAY['image/jpeg','image/jpg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════
-- 2. RLS Storage — upload uniquement pour users connectés
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

-- Suppression uniquement par le propriétaire du fichier
DROP POLICY IF EXISTS "products_storage_delete" ON storage.objects;
CREATE POLICY "products_storage_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'products'
    AND owner = auth.uid()
  );

-- ═══════════════════════════════════════════════════════
-- 3. RLS products — insert pour vendeurs connectés
-- ═══════════════════════════════════════════════════════
DROP POLICY IF EXISTS "products_insert_seller" ON public.products;
CREATE POLICY "products_insert_seller" ON public.products
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE auth_id = auth.uid()
      AND role IN ('artisan', 'admin')
    )
  );

-- Update : vendeur peut modifier ses propres produits
DROP POLICY IF EXISTS "products_update_own" ON public.products;
CREATE POLICY "products_update_own" ON public.products
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE auth_id = auth.uid() AND id = seller_id
    )
  );
