-- ============================================
-- Corriger toutes les autres policies qui font
-- un SELECT dans users → même risque de récursion
-- Remplacer par public.get_my_role()
-- ============================================

-- PRODUCTS
DROP POLICY IF EXISTS "products_select_admin" ON public.products;
DROP POLICY IF EXISTS "products_update_admin" ON public.products;
DROP POLICY IF EXISTS "products_delete_admin" ON public.products;
DROP POLICY IF EXISTS "products_select_own" ON public.products;
DROP POLICY IF EXISTS "products_update_own" ON public.products;
DROP POLICY IF EXISTS "products_insert_seller" ON public.products;

CREATE POLICY "products_select_admin" ON public.products
  FOR SELECT USING (public.get_my_role() = 'admin');

CREATE POLICY "products_update_admin" ON public.products
  FOR UPDATE USING (public.get_my_role() = 'admin');

CREATE POLICY "products_delete_admin" ON public.products
  FOR DELETE USING (public.get_my_role() = 'admin');

CREATE POLICY "products_select_own" ON public.products
  FOR SELECT USING (
    seller_id = (SELECT id FROM public.users WHERE auth_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "products_update_own" ON public.products
  FOR UPDATE USING (
    seller_id = (SELECT id FROM public.users WHERE auth_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "products_insert_seller" ON public.products
  FOR INSERT WITH CHECK (
    public.get_my_role() IN ('artisan', 'admin')
  );

-- ORDERS
DROP POLICY IF EXISTS "orders_select_admin" ON public.orders;
DROP POLICY IF EXISTS "orders_update_admin" ON public.orders;

CREATE POLICY "orders_select_admin" ON public.orders
  FOR SELECT USING (public.get_my_role() = 'admin');

CREATE POLICY "orders_update_admin" ON public.orders
  FOR UPDATE USING (public.get_my_role() = 'admin');

-- CATEGORIES
DROP POLICY IF EXISTS "categories_insert_admin" ON public.categories;
DROP POLICY IF EXISTS "categories_update_admin" ON public.categories;
DROP POLICY IF EXISTS "categories_delete_admin" ON public.categories;

CREATE POLICY "categories_insert_admin" ON public.categories
  FOR INSERT WITH CHECK (public.get_my_role() = 'admin');

CREATE POLICY "categories_update_admin" ON public.categories
  FOR UPDATE USING (public.get_my_role() = 'admin');

CREATE POLICY "categories_delete_admin" ON public.categories
  FOR DELETE USING (public.get_my_role() = 'admin');

-- NEWSLETTER
DROP POLICY IF EXISTS "newsletter_select_admin" ON public.newsletter;

CREATE POLICY "newsletter_select_admin" ON public.newsletter
  FOR SELECT USING (public.get_my_role() = 'admin');

-- REVIEWS
DROP POLICY IF EXISTS "reviews_select_admin" ON public.reviews;
DROP POLICY IF EXISTS "reviews_update_admin" ON public.reviews;
DROP POLICY IF EXISTS "reviews_delete_admin" ON public.reviews;

CREATE POLICY "reviews_select_admin" ON public.reviews
  FOR SELECT USING (public.get_my_role() = 'admin');

CREATE POLICY "reviews_update_admin" ON public.reviews
  FOR UPDATE USING (public.get_my_role() = 'admin');

CREATE POLICY "reviews_delete_admin" ON public.reviews
  FOR DELETE USING (public.get_my_role() = 'admin');

-- CART ITEMS
DROP POLICY IF EXISTS "cart_select_own" ON public.cart_items;
DROP POLICY IF EXISTS "cart_insert_own" ON public.cart_items;
DROP POLICY IF EXISTS "cart_update_own" ON public.cart_items;
DROP POLICY IF EXISTS "cart_delete_own" ON public.cart_items;

CREATE POLICY "cart_select_own" ON public.cart_items
  FOR SELECT USING (
    user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "cart_insert_own" ON public.cart_items
  FOR INSERT WITH CHECK (
    user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "cart_update_own" ON public.cart_items
  FOR UPDATE USING (
    user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "cart_delete_own" ON public.cart_items
  FOR DELETE USING (
    user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid() LIMIT 1)
  );
