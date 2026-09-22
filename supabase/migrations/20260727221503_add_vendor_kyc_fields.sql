-- Champs KYC vendeur (document légal + adresse exacte + suivi validation)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS document_type text CHECK (document_type = ANY (ARRAY['cni'::text, 'passeport'::text])),
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS vendor_validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS vendor_reject_reason text;

COMMENT ON COLUMN public.users.document_type IS 'Type de document légal fourni par le vendeur : cni ou passeport';
COMMENT ON COLUMN public.users.address IS 'Adresse exacte du vendeur, utilisée pour vérification et envoi/réception de fonds';
COMMENT ON COLUMN public.users.vendor_validated_at IS 'Date de validation admin du compte vendeur';
COMMENT ON COLUMN public.users.vendor_reject_reason IS 'Motif de refus si le vendeur est rejeté par l''admin';

-- Bucket privé pour les documents d'identité (CNI/passeport) — jamais public
INSERT INTO storage.buckets (id, name, public)
VALUES ('kyc-documents', 'kyc-documents', false)
ON CONFLICT (id) DO NOTHING;

-- RLS : chaque utilisateur ne peut déposer/lire que ses propres documents (dossier = auth.uid())
CREATE POLICY "kyc_upload_own_docs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'kyc-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "kyc_read_own_docs" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'kyc-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

-- RLS : l'admin peut lire tous les documents pour validation
CREATE POLICY "kyc_admin_read_all" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'kyc-documents'
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_id = auth.uid() AND u.role = 'admin'
    )
  );
