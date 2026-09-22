-- ============================================
-- CORRECTION 1 : Policy SELECT users
-- Avant : tout le monde peut lire tous les profils (qual = true)
-- Après : chacun lit son propre profil + les infos publiques des artisans
-- ============================================
DROP POLICY IF EXISTS "Public read users" ON public.users;

CREATE POLICY "users_select_own" ON public.users
  FOR SELECT USING (
    auth_id = auth.uid()
  );

CREATE POLICY "users_select_artisan_public" ON public.users
  FOR SELECT USING (
    role = 'artisan' AND status = 'active'
  );

-- ============================================
-- CORRECTION 2 : Policy UPDATE users
-- Avant : qual = true → n'importe qui peut modifier n'importe qui
-- Après : uniquement son propre profil via auth_id
-- ============================================
DROP POLICY IF EXISTS "Users update own profile" ON public.users;

CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE USING (
    auth_id = auth.uid()
  ) WITH CHECK (
    auth_id = auth.uid()
  );

-- ============================================
-- CORRECTION 3 : Slug manquant sur la catégorie SMARTPHONE
-- ============================================
UPDATE public.categories
SET slug = 'smartphone-electronique'
WHERE name = 'SMARTPHONE ET ELECTRONIQUE' AND slug IS NULL;
