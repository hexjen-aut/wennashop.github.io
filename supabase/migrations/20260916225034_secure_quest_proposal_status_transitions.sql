-- Le chasseur ne peut faire avancer le statut que jusqu'à "in_delivery" ou "delivered".
-- Il ne peut jamais se verser lui-même la récompense (reward_paid).
drop policy if exists proposals_update_hunter on public.quest_proposals;
create policy proposals_update_hunter on public.quest_proposals for update
  using (hunter_id in (select users.id from users where users.auth_id = auth.uid()))
  with check (
    hunter_id in (select users.id from users where users.auth_id = auth.uid())
    and status in ('in_delivery', 'delivered')
  );

-- Seul l'acheteur de la quête peut confirmer la réception (et donc déclencher
-- le versement de la récompense), jamais un autre statut.
create policy proposals_update_buyer on public.quest_proposals for update
  using (
    quest_id in (
      select quests.id from quests
      where quests.buyer_id in (select users.id from users where users.auth_id = auth.uid())
    )
  )
  with check (
    quest_id in (
      select quests.id from quests
      where quests.buyer_id in (select users.id from users where users.auth_id = auth.uid())
    )
    and status = 'reward_paid'
  );
