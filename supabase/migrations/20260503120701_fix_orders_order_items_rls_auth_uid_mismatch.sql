-- ══ ORDERS ══
DROP POLICY IF EXISTS "orders_insert_own" ON public.orders;
DROP POLICY IF EXISTS "orders_select" ON public.orders;

CREATE POLICY "orders_insert_own" ON public.orders
  FOR INSERT
  WITH CHECK (
    user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
  );

CREATE POLICY "orders_select" ON public.orders
  FOR SELECT
  USING (
    user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
    OR get_my_role() = 'admin'
  );

-- ══ ORDER_ITEMS ══
DROP POLICY IF EXISTS "order_items_insert_own" ON public.order_items;
DROP POLICY IF EXISTS "order_items_select_own" ON public.order_items;

CREATE POLICY "order_items_insert_own" ON public.order_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
        AND o.user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
    )
  );

CREATE POLICY "order_items_select_own" ON public.order_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
        AND o.user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
    )
    OR get_my_role() = 'admin'
  );

-- ══ PAYMENTS ══ (user_id aussi problématique)
DROP POLICY IF EXISTS "payments_select" ON public.payments;

CREATE POLICY "payments_select" ON public.payments
  FOR SELECT
  USING (
    user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
    OR get_my_role() = 'admin'
  );
