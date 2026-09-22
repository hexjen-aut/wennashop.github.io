-- Créer le bucket quest-proposals (public pour affichage direct)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'quest-proposals',
  'quest-proposals',
  true,
  5242880,
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Policy : chasseur authentifié peut uploader dans son dossier
CREATE POLICY "Hunter can upload proposal images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'quest-proposals'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy : lecture publique
CREATE POLICY "Public read quest proposal images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'quest-proposals');

-- Policy : chasseur peut supprimer ses propres images
CREATE POLICY "Hunter can delete own proposal images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'quest-proposals'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
