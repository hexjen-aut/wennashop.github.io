-- ============================================
-- 1. Passer hanamisama74 en admin
-- ============================================
UPDATE public.users
SET role = 'admin'
WHERE auth_id = '5681fafa-91e7-4e0a-a614-1fd840469c1e';

-- ============================================
-- 2. Corriger categories — ajouter vérification rôle admin
-- ============================================
DROP POLICY IF EXISTS "Admin insert categories" ON public.categories;
DROP POLICY IF EXISTS "Admin update categories" ON public.categories;
DROP POLICY IF EXISTS "Admin delete categories" ON public.categories;

CREATE POLICY "categories_insert_admin" ON public.categories
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE auth_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "categories_update_admin" ON public.categories
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.users WHERE auth_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "categories_delete_admin" ON public.categories
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.users WHERE auth_id = auth.uid() AND role = 'admin')
  );

-- ============================================
-- 3. Corriger newsletter — restreindre lecture aux admins
-- ============================================
DROP POLICY IF EXISTS "Admin read newsletter" ON public.newsletter;

CREATE POLICY "newsletter_select_admin" ON public.newsletter
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE auth_id = auth.uid() AND role = 'admin')
  );

-- ============================================
-- 4. Ajouter policy SELECT admin sur users
-- (pour que l'admin puisse voir tous les utilisateurs dans le dashboard)
-- ============================================
CREATE POLICY "users_select_admin" ON public.users
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.auth_id = auth.uid() AND u.role = 'admin')
  );

-- ============================================
-- 5. Ajouter policy UPDATE admin sur users
-- (pour que l'admin puisse changer les rôles / statuts)
-- ============================================
CREATE POLICY "users_update_admin" ON public.users
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.auth_id = auth.uid() AND u.role = 'admin')
  );

-- ============================================
-- 6. Ajouter policy SELECT admin sur orders
-- (pour que l'admin voie toutes les commandes)
-- ============================================
CREATE POLICY "orders_select_admin" ON public.orders
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE auth_id = auth.uid() AND role = 'admin')
  );

-- ============================================
-- 7. Ajouter policy SELECT admin sur reviews
-- (pour que l'admin puisse modérer les avis)
-- ============================================
CREATE POLICY "reviews_select_admin" ON public.reviews
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE auth_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "reviews_update_admin" ON public.reviews
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.users WHERE auth_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "reviews_delete_admin" ON public.reviews
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.users WHERE auth_id = auth.uid() AND role = 'admin')
  );
