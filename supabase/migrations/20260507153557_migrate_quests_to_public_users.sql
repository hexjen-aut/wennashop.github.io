-- =====================================================
-- ÉTAPE 1 : Supprimer les FK existantes vers auth.users
-- =====================================================
ALTER TABLE quests DROP CONSTRAINT IF EXISTS quests_buyer_id_fkey;
ALTER TABLE quest_proposals DROP CONSTRAINT IF EXISTS quest_proposals_hunter_id_fkey;
ALTER TABLE quest_disputes DROP CONSTRAINT IF EXISTS quest_disputes_raised_by_fkey;

-- =====================================================
-- ÉTAPE 2 : Convertir les valeurs auth_id → public users.id
-- =====================================================

-- quests.buyer_id : remplacer auth_id par users.id
UPDATE quests q
SET buyer_id = u.id
FROM users u
WHERE u.auth_id = q.buyer_id;

-- quest_proposals.hunter_id : remplacer auth_id par users.id
UPDATE quest_proposals qp
SET hunter_id = u.id
FROM users u
WHERE u.auth_id = qp.hunter_id;

-- quest_disputes.raised_by : remplacer auth_id par users.id
UPDATE quest_disputes qd
SET raised_by = u.id
FROM users u
WHERE u.auth_id = qd.raised_by;

-- =====================================================
-- ÉTAPE 3 : Recréer les FK vers public.users
-- =====================================================
ALTER TABLE quests
  ADD CONSTRAINT quests_buyer_id_fkey
  FOREIGN KEY (buyer_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE quest_proposals
  ADD CONSTRAINT quest_proposals_hunter_id_fkey
  FOREIGN KEY (hunter_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE quest_disputes
  ADD CONSTRAINT quest_disputes_raised_by_fkey
  FOREIGN KEY (raised_by) REFERENCES public.users(id) ON DELETE SET NULL;
