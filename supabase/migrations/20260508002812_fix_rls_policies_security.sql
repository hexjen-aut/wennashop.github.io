-- 1. quest_proposals SELECT : restreindre aux parties concernées
DROP POLICY IF EXISTS "proposals_select" ON quest_proposals;
CREATE POLICY "proposals_select" ON quest_proposals
  FOR SELECT USING (
    hunter_id IN (SELECT id FROM users WHERE auth_id = (SELECT auth.uid()))
    OR quest_id IN (SELECT id FROM quests WHERE buyer_id IN (SELECT id FROM users WHERE auth_id = (SELECT auth.uid())))
    OR get_my_role() = 'admin'
  );

-- 2. quest_disputes : supprimer les doublons, garder la meilleure version
DROP POLICY IF EXISTS "quest_disputes_select" ON quest_disputes;
DROP POLICY IF EXISTS "quest_disputes_update_admin" ON quest_disputes;

-- 3. payments_insert : exiger que user_id appartient à l'utilisateur connecté
DROP POLICY IF EXISTS "payments_insert_service" ON payments;
CREATE POLICY "payments_insert_service" ON payments
  FOR INSERT WITH CHECK (
    user_id IN (SELECT id FROM users WHERE auth_id = (SELECT auth.uid()))
    OR get_my_role() = 'admin'
  );
