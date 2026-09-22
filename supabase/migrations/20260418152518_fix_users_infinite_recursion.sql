-- ============================================
-- Supprimer les policies récursives sur users
-- ============================================
DROP POLICY IF EXISTS "users_select_admin" ON public.users;
DROP POLICY IF EXISTS "users_update_admin" ON public.users;
DROP POLICY IF EXISTS "users_select_own" ON public.users;
DROP POLICY IF EXISTS "users_select_artisan_public" ON public.users;
DROP POLICY IF EXISTS "users_update_own" ON public.users;
DROP POLICY IF EXISTS "users_insert_own" ON public.users;

-- ============================================
-- Créer une fonction SECURITY DEFINER
-- Elle lit le rôle sans déclencher les policies RLS
-- ============================================
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM public.users WHERE auth_id = auth.uid() LIMIT 1;
$$;

-- ============================================
-- Recréer toutes les policies users sans récursion
-- ============================================

-- SELECT : son propre profil
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT USING (
    auth_id = auth.uid()
  );

-- SELECT : infos publiques des artisans actifs
CREATE POLICY "users_select_artisan_public" ON public.users
  FOR SELECT USING (
    role = 'artisan' AND status = 'active'
  );

-- SELECT : admin voit tout (via fonction SECURITY DEFINER)
CREATE POLICY "users_select_admin" ON public.users
  FOR SELECT USING (
    public.get_my_role() = 'admin'
  );

-- INSERT : lier son propre auth_id
CREATE POLICY "users_insert_own" ON public.users
  FOR INSERT WITH CHECK (
    auth_id = auth.uid()
  );

-- UPDATE : son propre profil
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE USING (
    auth_id = auth.uid()
  ) WITH CHECK (
    auth_id = auth.uid()
  );

-- UPDATE : admin peut modifier n'importe quel profil
CREATE POLICY "users_update_admin" ON public.users
  FOR UPDATE USING (
    public.get_my_role() = 'admin'
  );
