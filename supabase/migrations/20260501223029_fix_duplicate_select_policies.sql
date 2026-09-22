-- ÉTAPE 7 : Fusionner les policies SELECT en double

-- orders: fusionner orders_select_own + orders_select_admin
DROP POLICY IF EXISTS "orders_select_admin" ON public.orders;
DROP POLICY IF EXISTS "orders_select_own" ON public.orders;
CREATE POLICY "orders_select" ON public.orders FOR SELECT
  USING (
    (select auth.uid()) = user_id
    OR EXISTS (SELECT 1 FROM public.users WHERE auth_id = (select auth.uid()) AND role = 'admin')
  );

-- payments: fusionner payments_select_own + payments_select_admin
DROP POLICY IF EXISTS "payments_select_admin" ON public.payments;
DROP POLICY IF EXISTS "payments_select_own" ON public.payments;
CREATE POLICY "payments_select" ON public.payments FOR SELECT
  USING (
    (select auth.uid()) = user_id
    OR EXISTS (SELECT 1 FROM public.users WHERE auth_id = (select auth.uid()) AND role = 'admin')
  );

-- products: fusionner products_select_active + products_select_own + products_select_admin
DROP POLICY IF EXISTS "products_select_active" ON public.products;
DROP POLICY IF EXISTS "products_select_own" ON public.products;
DROP POLICY IF EXISTS "products_select_admin" ON public.products;
CREATE POLICY "products_select" ON public.products FOR SELECT
  USING (
    status = 'active'
    OR (select auth.uid()) = seller_id
    OR EXISTS (SELECT 1 FROM public.users WHERE auth_id = (select auth.uid()) AND role = 'admin')
  );

-- products UPDATE: fusionner products_update_own + products_update_admin
DROP POLICY IF EXISTS "products_update_own" ON public.products;
DROP POLICY IF EXISTS "products_update_admin" ON public.products;
CREATE POLICY "products_update" ON public.products FOR UPDATE
  USING (
    (select auth.uid()) = seller_id
    OR EXISTS (SELECT 1 FROM public.users WHERE auth_id = (select auth.uid()) AND role = 'admin')
  );

-- reviews: fusionner reviews_select_approved + reviews_select_admin
DROP POLICY IF EXISTS "reviews_select_approved" ON public.reviews;
DROP POLICY IF EXISTS "reviews_select_admin" ON public.reviews;
CREATE POLICY "reviews_select" ON public.reviews FOR SELECT
  USING (
    status = 'approved'
    OR EXISTS (SELECT 1 FROM public.users WHERE auth_id = (select auth.uid()) AND role = 'admin')
  );

-- site_config: fusionner site_config_read_public + site_config_write_admin (SELECT seulement)
DROP POLICY IF EXISTS "site_config_read_public" ON public.site_config;
DROP POLICY IF EXISTS "site_config_write_admin" ON public.site_config;
CREATE POLICY "site_config_select" ON public.site_config FOR SELECT USING (true);
CREATE POLICY "site_config_update_admin" ON public.site_config FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.users WHERE auth_id = (select auth.uid()) AND role = 'admin'));

-- users: fusionner users_select_own + users_select_artisan_public + users_select_admin
DROP POLICY IF EXISTS "users_select_own" ON public.users;
DROP POLICY IF EXISTS "users_select_artisan_public" ON public.users;
DROP POLICY IF EXISTS "users_select_admin" ON public.users;
CREATE POLICY "users_select" ON public.users FOR SELECT
  USING (
    auth_id = (select auth.uid())
    OR role = 'artisan'
    OR EXISTS (SELECT 1 FROM public.users u2 WHERE u2.auth_id = (select auth.uid()) AND u2.role = 'admin')
  );

-- users UPDATE: fusionner users_update_own + users_update_admin
DROP POLICY IF EXISTS "users_update_own" ON public.users;
DROP POLICY IF EXISTS "users_update_admin" ON public.users;
CREATE POLICY "users_update" ON public.users FOR UPDATE
  USING (
    auth_id = (select auth.uid())
    OR EXISTS (SELECT 1 FROM public.users u2 WHERE u2.auth_id = (select auth.uid()) AND u2.role = 'admin')
  );

-- subscriptions: garder une seule policy qui couvre les deux cas
DROP POLICY IF EXISTS "vendor_read_own_sub" ON public.subscriptions;
DROP POLICY IF EXISTS "admin_all_subscriptions" ON public.subscriptions;
CREATE POLICY "subscriptions_select" ON public.subscriptions FOR SELECT
  USING (
    user_id = (select auth.uid())
    OR EXISTS (SELECT 1 FROM public.users WHERE auth_id = (select auth.uid()) AND role = 'admin')
  );
