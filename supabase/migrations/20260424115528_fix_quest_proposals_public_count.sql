-- Permettre à tous de lire le count des proposals (pour affichage public des quêtes)
DROP POLICY IF EXISTS "proposals_select" ON quest_proposals;

CREATE POLICY "proposals_select" ON quest_proposals
  FOR SELECT USING (
    -- Accès complet pour hunter ou buyer de la quête
    (auth.uid() = hunter_id)
    OR (auth.uid() = (SELECT buyer_id FROM quests WHERE id = quest_proposals.quest_id))
    -- Accès anonyme autorisé (pour count public sur la page quêtes)
    OR (auth.uid() IS NULL)
  );
