-- =====================================================
-- QUESTS — recréer les policies avec le bon pattern
-- =====================================================
DROP POLICY IF EXISTS quests_insert_buyer ON quests;
DROP POLICY IF EXISTS quests_select ON quests;
DROP POLICY IF EXISTS quests_update_buyer ON quests;
DROP POLICY IF EXISTS quests_update_admin ON quests;

CREATE POLICY quests_select ON quests
  FOR SELECT USING (
    status = 'open'
    OR buyer_id IN (SELECT id FROM users WHERE auth_id = (SELECT auth.uid()))
    OR get_my_role() = 'admin'
  );

CREATE POLICY quests_insert_buyer ON quests
  FOR INSERT WITH CHECK (
    buyer_id IN (SELECT id FROM users WHERE auth_id = (SELECT auth.uid()))
  );

CREATE POLICY quests_update_buyer ON quests
  FOR UPDATE USING (
    buyer_id IN (SELECT id FROM users WHERE auth_id = (SELECT auth.uid()))
  );

CREATE POLICY quests_update_admin ON quests
  FOR UPDATE USING (get_my_role() = 'admin');

-- =====================================================
-- QUEST_PROPOSALS — recréer les policies
-- =====================================================
DROP POLICY IF EXISTS proposals_insert ON quest_proposals;
DROP POLICY IF EXISTS proposals_select ON quest_proposals;
DROP POLICY IF EXISTS proposals_update_hunter ON quest_proposals;

CREATE POLICY proposals_select ON quest_proposals
  FOR SELECT USING (true);

CREATE POLICY proposals_insert ON quest_proposals
  FOR INSERT WITH CHECK (
    hunter_id IN (SELECT id FROM users WHERE auth_id = (SELECT auth.uid()))
  );

CREATE POLICY proposals_update_hunter ON quest_proposals
  FOR UPDATE USING (
    hunter_id IN (SELECT id FROM users WHERE auth_id = (SELECT auth.uid()))
  );

-- =====================================================
-- QUEST_DISPUTES — recréer les policies
-- =====================================================
DROP POLICY IF EXISTS disputes_insert ON quest_disputes;
DROP POLICY IF EXISTS disputes_select ON quest_disputes;
DROP POLICY IF EXISTS disputes_update_admin ON quest_disputes;

CREATE POLICY disputes_select ON quest_disputes
  FOR SELECT USING (
    raised_by IN (SELECT id FROM users WHERE auth_id = (SELECT auth.uid()))
    OR get_my_role() = 'admin'
  );

CREATE POLICY disputes_insert ON quest_disputes
  FOR INSERT WITH CHECK (
    raised_by IN (SELECT id FROM users WHERE auth_id = (SELECT auth.uid()))
  );

CREATE POLICY disputes_update_admin ON quest_disputes
  FOR UPDATE USING (get_my_role() = 'admin');
