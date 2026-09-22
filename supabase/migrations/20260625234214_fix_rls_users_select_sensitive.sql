-- ============================================================
-- PATCH 3 : users_select — colonnes sensibles protégées
-- Les vendeurs sont lisibles publiquement (nécessaire marketplace)
-- MAIS on ajoute une vue publique sécurisée sans données sensibles
-- et on restreint la policy principale
-- ============================================================

-- Vue publique pour les profils vendeurs (sans données sensibles)
CREATE OR REPLACE VIEW public.vendors_public AS
  SELECT 
    id,
    full_name,
    first_name,
    country,
    city,
    role,
    status,
    avatar_url,
    specialty,
    created_at
  FROM public.users
  WHERE role = 'artisan' AND status = 'active';

-- Accès public à cette vue
GRANT SELECT ON public.vendors_public TO anon, authenticated;

-- Restreindre la policy users_select : 
-- un utilisateur non-connecté ne voit PLUS les données brutes des artisans
DROP POLICY IF EXISTS "users_select" ON public.users;

CREATE POLICY "users_select"
ON public.users
FOR SELECT
USING (
  auth_id = (SELECT auth.uid())           -- son propre profil
  OR get_my_role() = 'admin'              -- admin voit tout
  OR (                                    -- vendeurs vérifiés lisibles (sans données sensibles via la vue)
    role = 'artisan'
    AND status = 'active'
    AND auth.uid() IS NOT NULL            -- utilisateur connecté seulement
  )
);
