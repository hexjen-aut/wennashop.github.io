-- product_images : fusionner les 2 policies SELECT publiques en une seule
DROP POLICY IF EXISTS "product_images_public_select" ON public.product_images;
DROP POLICY IF EXISTS "product_images_select_public" ON public.product_images;
CREATE POLICY "product_images_select_public" ON public.product_images FOR SELECT USING (true);

-- order_items : fusionner own + admin
DROP POLICY IF EXISTS "order_items_select_own" ON public.order_items;
DROP POLICY IF EXISTS "order_items_select_admin" ON public.order_items;
CREATE POLICY "order_items_select" ON public.order_items FOR SELECT USING (
  (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND o.user_id IN (SELECT id FROM users WHERE auth_id = (SELECT auth.uid()))))
  OR (get_my_role() = 'admin')
);

-- quest_disputes : fusionner raised_by + admin
DROP POLICY IF EXISTS "disputes_select" ON public.quest_disputes;
DROP POLICY IF EXISTS "quest_disputes_select_admin" ON public.quest_disputes;
CREATE POLICY "quest_disputes_select" ON public.quest_disputes FOR SELECT USING (
  (raised_by = (SELECT auth.uid())) OR (get_my_role() = 'admin')
);

-- quests : fusionner open + admin
DROP POLICY IF EXISTS "quests_select_open" ON public.quests;
DROP POLICY IF EXISTS "quests_select_admin" ON public.quests;
CREATE POLICY "quests_select" ON public.quests FOR SELECT USING (
  (status = 'open') OR (buyer_id = (SELECT auth.uid())) OR (get_my_role() = 'admin')
);

-- subscriptions : fusionner user + admin
DROP POLICY IF EXISTS "subscriptions_select" ON public.subscriptions;
DROP POLICY IF EXISTS "subscriptions_select_admin" ON public.subscriptions;
CREATE POLICY "subscriptions_select" ON public.subscriptions FOR SELECT USING (
  (user_id = (SELECT auth.uid())) OR (get_my_role() = 'admin')
);

-- vendor_wallets : fusionner user + admin
DROP POLICY IF EXISTS "user_wallet_select" ON public.vendor_wallets;
DROP POLICY IF EXISTS "vendor_wallets_select_admin" ON public.vendor_wallets;
CREATE POLICY "vendor_wallets_select" ON public.vendor_wallets FOR SELECT USING (
  (user_id = (SELECT auth.uid())) OR (get_my_role() = 'admin')
);

-- wallet_transactions : fusionner user + admin
DROP POLICY IF EXISTS "user_wallet_transactions_select" ON public.wallet_transactions;
DROP POLICY IF EXISTS "wallet_transactions_select_admin" ON public.wallet_transactions;
CREATE POLICY "wallet_transactions_select" ON public.wallet_transactions FOR SELECT USING (
  (user_id = (SELECT auth.uid())) OR (get_my_role() = 'admin')
);
