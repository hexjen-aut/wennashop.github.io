-- =====================================================
-- vendor_wallets — corriger le pattern auth.uid()
-- =====================================================
DROP POLICY IF EXISTS vendor_wallets_select ON vendor_wallets;
DROP POLICY IF EXISTS vendor_wallets_update_admin ON vendor_wallets;

CREATE POLICY vendor_wallets_select ON vendor_wallets
  FOR SELECT USING (
    user_id IN (SELECT id FROM users WHERE auth_id = (SELECT auth.uid()))
    OR get_my_role() = 'admin'
  );

CREATE POLICY vendor_wallets_update_admin ON vendor_wallets
  FOR UPDATE USING (get_my_role() = 'admin');

-- Ajouter INSERT pour le webhook (service_role bypass RLS de toute façon,
-- mais on sécurise aussi le cas user normal)
DROP POLICY IF EXISTS vendor_wallets_insert ON vendor_wallets;
CREATE POLICY vendor_wallets_insert ON vendor_wallets
  FOR INSERT WITH CHECK (
    user_id IN (SELECT id FROM users WHERE auth_id = (SELECT auth.uid()))
    OR get_my_role() = 'admin'
  );

-- =====================================================
-- wallet_transactions — corriger le pattern auth.uid()
-- =====================================================
DROP POLICY IF EXISTS wallet_transactions_select ON wallet_transactions;
DROP POLICY IF EXISTS wallet_transactions_insert_admin ON wallet_transactions;

CREATE POLICY wallet_transactions_select ON wallet_transactions
  FOR SELECT USING (
    user_id IN (SELECT id FROM users WHERE auth_id = (SELECT auth.uid()))
    OR get_my_role() = 'admin'
  );

-- INSERT : service_role (webhook) bypass RLS automatiquement.
-- On autorise aussi l'admin via le dashboard.
CREATE POLICY wallet_transactions_insert_admin ON wallet_transactions
  FOR INSERT WITH CHECK (get_my_role() = 'admin');
