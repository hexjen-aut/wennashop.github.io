-- Proposer une offre sur une quête est réservé aux chasseurs VÉRIFIÉS,
-- quel que soit leur rôle (acheteur, vendeur ou admin). Avant : il fallait
-- être vendeur ou admin, si bien qu'un chasseur vérifié acheteur était
-- refusé et qu'un vendeur non vérifié pouvait proposer.
-- Toujours interdit : répondre à sa propre quête ; nouveau : la quête doit
-- être ouverte.
alter policy proposals_insert on public.quest_proposals
  with check (
    hunter_id = public.my_user_id()
    and exists (select 1 from public.users u where u.id = public.my_user_id() and u.hunter_status = 'verified')
    and exists (select 1 from public.quests q where q.id = quest_id and q.status = 'open' and q.buyer_id is distinct from public.my_user_id())
  );
