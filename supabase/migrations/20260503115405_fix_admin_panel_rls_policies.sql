-- 1. site_config : INSERT pour admin (nécessaire pour upsert)
CREATE POLICY "site_config_insert_admin" ON public.site_config
  FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role = 'admin')
  );

-- 2. product_images : CRUD complet pour admin
CREATE POLICY "product_images_insert_admin" ON public.product_images
  FOR INSERT
  WITH CHECK (get_my_role() = 'admin');

CREATE POLICY "product_images_update_admin" ON public.product_images
  FOR UPDATE
  USING (get_my_role() = 'admin');

CREATE POLICY "product_images_delete_admin" ON public.product_images
  FOR DELETE
  USING (get_my_role() = 'admin');

-- 3. order_items : UPDATE + DELETE pour admin
CREATE POLICY "order_items_update_admin" ON public.order_items
  FOR UPDATE
  USING (get_my_role() = 'admin');

CREATE POLICY "order_items_delete_admin" ON public.order_items
  FOR DELETE
  USING (get_my_role() = 'admin');

-- 4. order_items : SELECT pour admin (la policy actuelle ne couvre que le propriétaire)
CREATE POLICY "order_items_select_admin" ON public.order_items
  FOR SELECT
  USING (get_my_role() = 'admin');

-- 5. users : DELETE pour admin
CREATE POLICY "users_delete_admin" ON public.users
  FOR DELETE
  USING (get_my_role() = 'admin');

-- 6. vendor_wallets : SELECT + UPDATE pour admin
CREATE POLICY "vendor_wallets_select_admin" ON public.vendor_wallets
  FOR SELECT
  USING (get_my_role() = 'admin');

CREATE POLICY "vendor_wallets_update_admin" ON public.vendor_wallets
  FOR UPDATE
  USING (get_my_role() = 'admin');

-- 7. wallet_transactions : SELECT + INSERT pour admin
CREATE POLICY "wallet_transactions_select_admin" ON public.wallet_transactions
  FOR SELECT
  USING (get_my_role() = 'admin');

CREATE POLICY "wallet_transactions_insert_admin" ON public.wallet_transactions
  FOR INSERT
  WITH CHECK (get_my_role() = 'admin');

-- 8. subscriptions : SELECT + UPDATE pour admin
CREATE POLICY "subscriptions_select_admin" ON public.subscriptions
  FOR SELECT
  USING (get_my_role() = 'admin');

CREATE POLICY "subscriptions_update_admin" ON public.subscriptions
  FOR UPDATE
  USING (get_my_role() = 'admin');

-- 9. quest_disputes : SELECT + UPDATE pour admin (actuellement limité au créateur)
CREATE POLICY "quest_disputes_select_admin" ON public.quest_disputes
  FOR SELECT
  USING (get_my_role() = 'admin');

CREATE POLICY "quest_disputes_update_admin" ON public.quest_disputes
  FOR UPDATE
  USING (get_my_role() = 'admin');

-- 10. quests : SELECT + UPDATE pour admin (actuellement limité au buyer)
CREATE POLICY "quests_select_admin" ON public.quests
  FOR SELECT
  USING (get_my_role() = 'admin');

CREATE POLICY "quests_update_admin" ON public.quests
  FOR UPDATE
  USING (get_my_role() = 'admin');
