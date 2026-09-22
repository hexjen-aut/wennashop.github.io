-- Supprimer l'ancienne policy INSERT permissive
DROP POLICY IF EXISTS "proposals_insert" ON quest_proposals;

-- Nouvelle policy : seuls artisan et admin peuvent proposer
-- + hunter_id doit correspondre à l'utilisateur connecté
-- + l'acheteur de la quête ne peut pas proposer sur sa propre quête
CREATE POLICY "proposals_insert" ON quest_proposals
FOR INSERT
WITH CHECK (
  -- hunter_id = users.id de l'utilisateur connecté
  hunter_id IN (
    SELECT id FROM users WHERE auth_id = auth.uid()
  )
  AND
  -- Rôle obligatoire : artisan ou admin
  (
    SELECT role FROM users WHERE auth_id = auth.uid()
  ) IN ('artisan', 'admin')
  AND
  -- Ne peut pas proposer sur sa propre quête
  quest_id NOT IN (
    SELECT id FROM quests
    WHERE buyer_id IN (
      SELECT id FROM users WHERE auth_id = auth.uid()
    )
  )
);
