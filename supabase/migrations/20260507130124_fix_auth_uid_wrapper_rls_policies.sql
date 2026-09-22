-- cart_items
DROP POLICY IF EXISTS "cart_delete_own" ON public.cart_items;
CREATE POLICY "cart_delete_own" ON public.cart_items FOR DELETE USING (
  user_id IN (SELECT id FROM users WHERE auth_id = (SELECT auth.uid()))
);

DROP POLICY IF EXISTS "cart_insert_own" ON public.cart_items;
CREATE POLICY "cart_insert_own" ON public.cart_items FOR INSERT WITH CHECK (
  user_id IN (SELECT id FROM users WHERE auth_id = (SELECT auth.uid()))
);

DROP POLICY IF EXISTS "cart_select_own" ON public.cart_items;
CREATE POLICY "cart_select_own" ON public.cart_items FOR SELECT USING (
  user_id IN (SELECT id FROM users WHERE auth_id = (SELECT auth.uid()))
);

DROP POLICY IF EXISTS "cart_update_own" ON public.cart_items;
CREATE POLICY "cart_update_own" ON public.cart_items FOR UPDATE USING (
  user_id IN (SELECT id FROM users WHERE auth_id = (SELECT auth.uid()))
);

-- order_items
DROP POLICY IF EXISTS "order_items_insert_own" ON public.order_items;
CREATE POLICY "order_items_insert_own" ON public.order_items FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND o.user_id IN (SELECT id FROM users WHERE auth_id = (SELECT auth.uid())))
);

DROP POLICY IF EXISTS "order_items_select_own" ON public.order_items;
CREATE POLICY "order_items_select_own" ON public.order_items FOR SELECT USING (
  (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND o.user_id IN (SELECT id FROM users WHERE auth_id = (SELECT auth.uid()))))
  OR (get_my_role() = 'admin')
);

-- orders
DROP POLICY IF EXISTS "orders_insert_own" ON public.orders;
CREATE POLICY "orders_insert_own" ON public.orders FOR INSERT WITH CHECK (
  user_id IN (SELECT id FROM users WHERE auth_id = (SELECT auth.uid()))
);

DROP POLICY IF EXISTS "orders_select" ON public.orders;
CREATE POLICY "orders_select" ON public.orders FOR SELECT USING (
  (user_id IN (SELECT id FROM users WHERE auth_id = (SELECT auth.uid()))) OR (get_my_role() = 'admin')
);

-- payments
DROP POLICY IF EXISTS "payments_select" ON public.payments;
CREATE POLICY "payments_select" ON public.payments FOR SELECT USING (
  (user_id IN (SELECT id FROM users WHERE auth_id = (SELECT auth.uid()))) OR (get_my_role() = 'admin')
);

-- products
DROP POLICY IF EXISTS "products_select" ON public.products;
CREATE POLICY "products_select" ON public.products FOR SELECT USING (
  (status = 'active') OR ((SELECT auth.uid()) = seller_id) OR (get_my_role() = 'admin')
);

DROP POLICY IF EXISTS "products_update" ON public.products;
CREATE POLICY "products_update" ON public.products FOR UPDATE USING (
  ((SELECT auth.uid()) = seller_id) OR (get_my_role() = 'admin')
);

-- site_config
DROP POLICY IF EXISTS "site_config_insert_admin" ON public.site_config;
CREATE POLICY "site_config_insert_admin" ON public.site_config FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE auth_id = (SELECT auth.uid()) AND role = 'admin')
);

-- users
DROP POLICY IF EXISTS "users_select" ON public.users;
CREATE POLICY "users_select" ON public.users FOR SELECT USING (
  (auth_id = (SELECT auth.uid())) OR (role = 'artisan') OR (get_my_role() = 'admin')
);

DROP POLICY IF EXISTS "users_update" ON public.users;
CREATE POLICY "users_update" ON public.users FOR UPDATE USING (
  (auth_id = (SELECT auth.uid())) OR (get_my_role() = 'admin')
);
