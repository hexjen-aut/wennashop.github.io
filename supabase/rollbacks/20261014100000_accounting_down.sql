-- Retour arrière de 20261014100000_accounting.sql.
-- ATTENTION : supprime le grand livre. À n'utiliser qu'après export (onglet
-- Grand livre → Export) si des écritures réelles existent.
drop trigger if exists trg_orders_ledger on public.orders;
drop trigger if exists trg_payments_ledger on public.payments;

drop function if exists public.my_hunter_balance();
drop function if exists public.my_vendor_balance();
drop function if exists public.transfer_funds(text, text, numeric, text, text, text);
drop function if exists public.add_ledger_adjustment(numeric, text, text, date, uuid, uuid, text, text);
drop function if exists public.record_expense(text, text, numeric, text, date, text, text, text, uuid);
drop function if exists public.pay_hunter(uuid, text, numeric, text, text, text, text, text);
drop function if exists public.prepare_vendor_payouts(date);
drop function if exists public.pay_vendor(uuid, text, numeric, text, text, text, text, uuid, text);
drop function if exists public.confirm_cod_collected(uuid, text, text, numeric);
drop function if exists public.payments_ledger();
drop function if exists public.orders_ledger();
drop function if exists public.reverse_order_ledger(uuid, text);
drop function if exists public.post_order_ledger(uuid);

drop view if exists public.v_cash_position;
drop view if exists public.v_monthly_pnl;
drop view if exists public.v_hunter_balances;
drop view if exists public.v_vendor_balances;

drop function if exists public.ledger_method(text);
drop function if exists public.ledger_holder(text, text, jsonb);
drop function if exists public.ledger_round(numeric, text);

drop policy if exists accounting_proofs_admin_read on storage.objects;
drop policy if exists accounting_proofs_admin_upload on storage.objects;

drop table if exists public.expenses;
drop table if exists public.vendor_payouts;
-- Les déclencheurs d'immuabilité empêchent TRUNCATE, pas DROP TABLE
drop table if exists public.ledger_entries;
drop function if exists public.ledger_entries_immutable();
drop function if exists public.ledger_currency(text);

delete from public.site_config where key = 'quest_commission_pct';
-- Le bucket accounting-proofs est conservé (vider ses fichiers à la main si besoin).
