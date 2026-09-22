-- ÉTAPE 6 : Remplacer auth.uid() par (select auth.uid()) dans toutes les policies RLS

-- users
DROP POLICY IF EXISTS "users_select_own" ON public.users;
DROP POLICY IF EXISTS "users_insert_own" ON public.users;
DROP POLICY IF EXISTS "users_update_own" ON public.users;

CREATE POLICY "users_select_own" ON public.users FOR SELECT USING ((select auth.uid()) = auth_id OR role = 'artisan');
CREATE POLICY "users_insert_own" ON public.users FOR INSERT WITH CHECK ((select auth.uid()) = auth_id);
CREATE POLICY "users_update_own" ON public.users FOR UPDATE USING ((select auth.uid()) = auth_id);

-- cart_items
DROP POLICY IF EXISTS "cart_select_own" ON public.cart_items;
DROP POLICY IF EXISTS "cart_insert_own" ON public.cart_items;
DROP POLICY IF EXISTS "cart_update_own" ON public.cart_items;
DROP POLICY IF EXISTS "cart_delete_own" ON public.cart_items;

CREATE POLICY "cart_select_own" ON public.cart_items FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "cart_insert_own" ON public.cart_items FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "cart_update_own" ON public.cart_items FOR UPDATE USING ((select auth.uid()) = user_id);
CREATE POLICY "cart_delete_own" ON public.cart_items FOR DELETE USING ((select auth.uid()) = user_id);

-- orders
DROP POLICY IF EXISTS "orders_select_own" ON public.orders;
DROP POLICY IF EXISTS "orders_insert_own" ON public.orders;

CREATE POLICY "orders_select_own" ON public.orders FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "orders_insert_own" ON public.orders FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

-- order_items
DROP POLICY IF EXISTS "order_items_select_own" ON public.order_items;
DROP POLICY IF EXISTS "order_items_insert_own" ON public.order_items;

CREATE POLICY "order_items_select_own" ON public.order_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = (select auth.uid())));
CREATE POLICY "order_items_insert_own" ON public.order_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = (select auth.uid())));

-- products
DROP POLICY IF EXISTS "products_select_own" ON public.products;
DROP POLICY IF EXISTS "products_update_own" ON public.products;

CREATE POLICY "products_select_own" ON public.products FOR SELECT USING ((select auth.uid()) = seller_id);
CREATE POLICY "products_update_own" ON public.products FOR UPDATE USING ((select auth.uid()) = seller_id);

-- payments
DROP POLICY IF EXISTS "payments_select_own" ON public.payments;
DROP POLICY IF EXISTS "payments_insert_service" ON public.payments;

CREATE POLICY "payments_select_own" ON public.payments FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "payments_insert_service" ON public.payments FOR INSERT WITH CHECK ((select auth.uid()) IS NOT NULL);

-- reviews
DROP POLICY IF EXISTS "reviews_insert_auth" ON public.reviews;

CREATE POLICY "reviews_insert_auth" ON public.reviews FOR INSERT WITH CHECK ((select auth.uid()) IS NOT NULL);

-- quests
DROP POLICY IF EXISTS "quests_insert_buyer" ON public.quests;
DROP POLICY IF EXISTS "quests_update_buyer" ON public.quests;
DROP POLICY IF EXISTS "quests_select_open" ON public.quests;

CREATE POLICY "quests_select_open" ON public.quests FOR SELECT USING (status = 'open' OR buyer_id = (select auth.uid()));
CREATE POLICY "quests_insert_buyer" ON public.quests FOR INSERT WITH CHECK (buyer_id = (select auth.uid()));
CREATE POLICY "quests_update_buyer" ON public.quests FOR UPDATE USING (buyer_id = (select auth.uid()));

-- quest_proposals
DROP POLICY IF EXISTS "proposals_insert" ON public.quest_proposals;
DROP POLICY IF EXISTS "proposals_select" ON public.quest_proposals;
DROP POLICY IF EXISTS "proposals_update_hunter" ON public.quest_proposals;

CREATE POLICY "proposals_select" ON public.quest_proposals FOR SELECT USING (true);
CREATE POLICY "proposals_insert" ON public.quest_proposals FOR INSERT WITH CHECK (hunter_id = (select auth.uid()));
CREATE POLICY "proposals_update_hunter" ON public.quest_proposals FOR UPDATE USING (hunter_id = (select auth.uid()));

-- quest_disputes
DROP POLICY IF EXISTS "disputes_insert" ON public.quest_disputes;
DROP POLICY IF EXISTS "disputes_select" ON public.quest_disputes;

CREATE POLICY "disputes_select" ON public.quest_disputes FOR SELECT USING (raised_by = (select auth.uid()));
CREATE POLICY "disputes_insert" ON public.quest_disputes FOR INSERT WITH CHECK (raised_by = (select auth.uid()));

-- vendor_wallets
DROP POLICY IF EXISTS "user_wallet_select" ON public.vendor_wallets;

CREATE POLICY "user_wallet_select" ON public.vendor_wallets FOR SELECT USING (user_id = (select auth.uid()));

-- wallet_transactions
DROP POLICY IF EXISTS "user_wallet_transactions_select" ON public.wallet_transactions;

CREATE POLICY "user_wallet_transactions_select" ON public.wallet_transactions FOR SELECT USING (user_id = (select auth.uid()));

-- subscriptions
DROP POLICY IF EXISTS "vendor_read_own_sub" ON public.subscriptions;
DROP POLICY IF EXISTS "admin_all_subscriptions" ON public.subscriptions;

CREATE POLICY "vendor_read_own_sub" ON public.subscriptions FOR SELECT USING (user_id = (select auth.uid()));

-- deliveries
DROP POLICY IF EXISTS "deliveries_insert_driver_or_admin" ON public.deliveries;
DROP POLICY IF EXISTS "deliveries_update_driver_or_admin" ON public.deliveries;

CREATE POLICY "deliveries_insert_driver_or_admin" ON public.deliveries FOR INSERT
  WITH CHECK (driver_id = (select auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE auth_id = (select auth.uid()) AND role = 'admin'));
CREATE POLICY "deliveries_update_driver_or_admin" ON public.deliveries FOR UPDATE
  USING (driver_id = (select auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE auth_id = (select auth.uid()) AND role = 'admin'));

-- delivery_events
DROP POLICY IF EXISTS "delivery_events_insert_driver_or_admin" ON public.delivery_events;

CREATE POLICY "delivery_events_insert_driver_or_admin" ON public.delivery_events FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.deliveries d
    WHERE d.id = delivery_id
    AND (d.driver_id = (select auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE auth_id = (select auth.uid()) AND role = 'admin'))
  ));
