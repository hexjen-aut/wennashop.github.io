-- Le chasseur peut retirer sa propre proposition tant qu'elle est en attente.
-- Sans politique DELETE, le bouton « Retirer » de l'espace chasseur ne
-- supprimait rien (RLS filtre la ligne, l'API répond sans erreur).
drop policy if exists "proposals_delete_hunter" on public.quest_proposals;
create policy "proposals_delete_hunter" on public.quest_proposals for delete
  using (
    status = 'pending'
    and hunter_id in (select u.id from public.users u where u.auth_id = (select auth.uid()))
  );
