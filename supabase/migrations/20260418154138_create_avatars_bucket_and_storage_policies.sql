-- ============================================
-- 1. Créer le bucket avatars (public)
-- ============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 2. Policies Storage pour avatars
-- ============================================

-- Lecture publique des avatars
CREATE POLICY "avatars_read_public" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

-- Upload : uniquement son propre avatar (chemin = auth.uid/...)
CREATE POLICY "avatars_upload_own" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Update : uniquement son propre avatar
CREATE POLICY "avatars_update_own" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Delete : uniquement son propre avatar
CREATE POLICY "avatars_delete_own" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================
-- 3. Corriger policies Storage products
-- Ajouter UPDATE (remplacement d'image)
-- ============================================
CREATE POLICY "products_storage_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'products'
    AND auth.uid() IS NOT NULL
  );
