-- Retour arrière de 20261015100000_quest_advance.sql.
-- Les écritures d'avance déjà passées au grand livre restent (immuables) :
-- corrige-les par un ajustement si besoin. Remet ensuite les fonctions de
-- 20261012090000_quest_checkout.sql et 20261014100000_accounting.sql
-- (start_quest_checkout, orders_quest_paid, post_order_ledger, reverse_order_ledger)
-- en les rejouant depuis ces fichiers.
select cron.unschedule('flag-overdue-quest-handover');

drop trigger if exists quest_proposals_handover on public.quest_proposals;
drop trigger if exists quests_enforce_min_reward on public.quests;

drop function if exists public.flag_overdue_quest_handover();
drop function if exists public.quest_proposals_handover();
drop function if exists public.purchase_proof_queue(text, int);
drop function if exists public.review_purchase_proof(uuid, text, text);
drop function if exists public.submit_purchase_proof(uuid, numeric, text, text);
drop function if exists public.my_quest_advance_status();
drop function if exists public.notify_payment_staff(text, text, text);
drop function if exists public.quest_hunter_outstanding_xaf(uuid);
drop function if exists public.quest_hunter_delivered_count(uuid);
drop function if exists public.quest_to_xaf(numeric, text);
drop function if exists public.quests_enforce_min_reward();
drop function if exists public.quest_min_reward(numeric, text);

drop policy if exists quest_proofs_upload_own on storage.objects;
drop policy if exists quest_proofs_read_own on storage.objects;
drop policy if exists quest_proofs_read_staff on storage.objects;

drop table if exists public.quest_purchase_proofs;

-- post_order_ledger appelle post_order_cash : à supprimer après avoir rejoué
-- la version d'origine de post_order_ledger.
-- drop function if exists public.post_order_cash(uuid);
-- drop function if exists public.fmt_money(numeric, text);

delete from public.site_config where key in ('quest_reward_min_pct', 'quest_reward_floor_xaf', 'quest_reward_floor_mad',
  'quest_advance_min_quests', 'quest_advance_cap_xaf', 'quest_handover_hours');
