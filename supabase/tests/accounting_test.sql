-- Tests de la comptabilité (20261014100000_accounting.sql), sur des commandes
-- fictives, dans une transaction annulée : rien ne reste en base.
-- Supabase → SQL Editor : coller et exécuter. Chaque ligne du résultat doit
-- afficher « OK ».
begin;

create temp table t_ids as select
  (select id from public.users where role = 'admin' order by created_at limit 1) as admin_id,
  (select auth_id from public.users where role = 'admin' order by created_at limit 1) as admin_auth,
  (select id from public.users where hunter_status = 'verified' order by created_at limit 1) as hunter_id,
  (select auth_id from public.users where hunter_status = 'verified' order by created_at limit 1) as hunter_auth,
  (select id from public.users where role = 'buyer' and status = 'active' order by created_at limit 1) as buyer_id,
  (select s.id from public.shops s join public.users u on u.id = s.user_id where u.role = 'artisan' and u.status = 'active'
     and s.status = 'active' order by s.created_at limit 1) as shop_id,
  gen_random_uuid() as product_id, gen_random_uuid() as order1, gen_random_uuid() as order2;
alter table t_ids add column vendor_auth uuid;
update t_ids set vendor_auth = (select u.auth_id from public.shops s join public.users u on u.id = s.user_id where s.id = t_ids.shop_id);
create temp table t_res (n serial, test text, ok boolean, detail text);
grant all on t_ids, t_res to authenticated;
grant usage on sequence t_res_n_seq to authenticated;

-- Jeu de données : boutique à 10 %, parrainée par un chasseur vérifié, produit à 1 000 MAD
update public.shops set commission_rate = 10 where id = (select shop_id from t_ids);
select set_config('wenna.referral_write', 'on', true);
update public.shops set recruited_by = (select hunter_id from t_ids), recruited_at = now(), activated_at = null
  where id = (select shop_id from t_ids);
select set_config('wenna.referral_write', '', true);
insert into public.products (id, seller_id, shop_id, name, price, currency, status, stock)
select product_id, (select user_id from public.shops where id = shop_id), shop_id, 'Produit test compta', 1000, 'MAD', 'active', 50 from t_ids;

-- Commande 1 : 2 × 1 000 MAD, acheteur au Maroc, paiement à la livraison
insert into public.orders (id, user_id, status, currency, buyer_currency, total_amount, subtotal)
select order1, buyer_id, 'pending', 'MAD', 'MAD', 0, 0 from t_ids;
insert into public.order_items (order_id, product_id, quantity, unit_price)
select order1, product_id, 2, 1 from t_ids;
insert into public.payments (order_id, user_id, amount, currency, method, status, type, provider)
select order1, buyer_id, 2000, 'MAD', 'cash_on_delivery', 'pending', 'order_payment', 'manual' from t_ids;
update public.orders set status = 'processing' where id = (select order1 from t_ids);
update public.orders set status = 'shipped' where id = (select order1 from t_ids);
update public.orders set status = 'delivered' where id = (select order1 from t_ids);

insert into t_res (test, ok, detail)
select 'Livrée mais espèces non récupérées : aucune écriture',
  count(*) = 0, count(*) || ' écriture(s)' from public.ledger_entries where order_id = (select order1 from t_ids);

-- L'admin confirme les espèces récupérées par Ozone, qui retient 50 MAD de livraison
select set_config('request.jwt.claims', json_build_object('sub', admin_auth, 'role', 'authenticated')::text, true) from t_ids;
select public.confirm_cod_collected((select order1 from t_ids), 'Ozone', 'OZ-123', 50);

insert into t_res (test, ok, detail)
select 'Commande 1 : vente, commission 10 %, part vendeur, part chasseur',
  string_agg(type || '=' || amount, ', ' order by type) = 'commission_wenna=200.00, part_chasseur=40.00, part_vendeur=1800.00, vente_encaissee=2000.00',
  string_agg(type || '=' || amount, ', ' order by type)
from public.ledger_entries where order_id = (select order1 from t_ids);
insert into t_res (test, ok, detail)
select 'Commande 1 : argent chez Ozone, paiement à la livraison',
  bool_and(collected_by = 'Ozone' and payment_method = 'cod'), string_agg(collected_by, ',')
from public.ledger_entries where order_id = (select order1 from t_ids) and type = 'vente_encaissee';

insert into t_res (test, ok, detail)
select 'Frais Ozone : dépense livraison 50 MAD', count(*) = 1 and max(amount) = 50, count(*) || ' dépense(s)'
from public.ledger_entries where type = 'depense' and collected_by = 'Ozone' and created_at > now() - interval '1 minute';

-- Idempotence : relancer ne crée rien
insert into t_res (test, ok, detail)
select 'Idempotence : post_order_ledger relancé', public.post_order_ledger(order1) = 0, 'aucune nouvelle écriture' from t_ids;
update public.orders set status = 'delivered', updated_at = now() where id = (select order1 from t_ids);
insert into t_res (test, ok, detail)
select 'Idempotence : toujours 4 écritures', count(*) = 4, count(*) || ' écritures'
from public.ledger_entries where order_id = (select order1 from t_ids);

-- Commande 2 : acheteur en FCFA, 1 × 1 000 MAD, Airtel Money validé, puis retournée
insert into public.orders (id, user_id, status, currency, buyer_currency, total_amount, subtotal)
select order2, buyer_id, 'pending', 'MAD', 'XAF', 0, 0 from t_ids;
insert into public.order_items (order_id, product_id, quantity, unit_price)
select order2, product_id, 1, 1 from t_ids;
insert into public.payments (order_id, user_id, amount, currency, method, payment_method_code, status, type, provider, verification_status)
select order2, buyer_id, (select buyer_total_amount from public.orders where id = order2), 'XAF', 'airtel_money', 'airtel_money', 'paid',
  'order_payment', 'manual', 'validated' from t_ids;
update public.orders set status = 'processing' where id = (select order2 from t_ids);
update public.orders set status = 'delivered' where id = (select order2 from t_ids);

insert into t_res (test, ok, detail)
select 'Commande 2 : marge de change = montant × 4/104 (FCFA entiers)',
  max(amount) filter (where type = 'marge_change') = round(max(amount) filter (where type = 'vente_encaissee') * 4 / 104, 0)
  and max(amount) filter (where type = 'commission_wenna') = 100,
  string_agg(type || '=' || amount || ' ' || currency, ', ' order by type)
from public.ledger_entries where order_id = (select order2 from t_ids);

update public.orders set status = 'returned' where id = (select order2 from t_ids);
insert into t_res (test, ok, detail)
select 'Retour : écritures inverses et remboursement',
  coalesce(sum(amount) filter (where type in ('commission_wenna', 'part_vendeur', 'part_chasseur', 'marge_change')), 1) = 0
  and count(*) filter (where type = 'remboursement') = 1,
  string_agg(type || '=' || amount, ', ' order by type, amount)
from public.ledger_entries where order_id = (select order2 from t_ids);
update public.orders set status = 'cancelled' where id = (select order2 from t_ids);
insert into t_res (test, ok, detail)
select 'Retour : pas de double annulation', count(*) filter (where type = 'remboursement') = 1, count(*) || ' écritures'
from public.ledger_entries where order_id = (select order2 from t_ids);

-- Dépense, reversement vendeur, remise de fonds (admin)
select public.record_expense('Supabase', 'hebergement', 300, 'MAD', current_date, 'Compte bancaire Maroc');
select public.pay_vendor((select shop_id from t_ids), 'MAD', 1800, 'virement', 'VIR-001', 'Compte bancaire Maroc');
select public.transfer_funds('Ozone', 'Compte bancaire Maroc', 1950, 'MAD', 'OZ-VIR-01');

insert into t_res (test, ok, detail)
select 'Solde vendeur après reversement = 0', balance = 0, 'dû ' || due || ', payé ' || paid || ', solde ' || balance
from public.v_vendor_balances where shop_id = (select shop_id from t_ids) and currency = 'MAD';

insert into t_res (test, ok, detail)
select 'Compte de résultat MAD : commissions 200, parrainage 40, dépenses 350 (dont livraison 50), marge −190, GMV 2000',
  commissions = 200 and referral_costs = 40 and expenses = 350 and net_margin = -190 and gmv = 2000,
  'commissions ' || commissions || ', parrainage ' || referral_costs || ', dépenses ' || expenses || ', marge ' || net_margin || ', GMV ' || gmv
from public.v_monthly_pnl where month = date_trunc('month', current_date)::date and currency = 'MAD';

insert into t_res (test, ok, detail)
select 'Compte de résultat XAF : marge de change annulée, vente remboursée',
  fx_margin = 0 and gmv = refunds and gmv > 0, 'marge ' || fx_margin || ', GMV ' || gmv || ', remboursé ' || refunds
from public.v_monthly_pnl where month = date_trunc('month', current_date)::date and currency = 'XAF';

insert into t_res (test, ok, detail)
select 'Caisse : Ozone 0 (2 000 − 50 de livraison − 1 950 virés), compte bancaire −150 MAD',
  max(balance) filter (where collected_by = 'Ozone') = 0 and max(balance) filter (where collected_by = 'Compte bancaire Maroc') = -150,
  string_agg(collected_by || '=' || balance, ', ')
from public.v_cash_position where currency = 'MAD' and collected_by in ('Ozone', 'Compte bancaire Maroc');

-- Immuabilité
do $$ begin
  update public.ledger_entries set amount = 0 where order_id = (select order1 from t_ids);
  insert into t_res (test, ok, detail) values ('Écritures immuables', false, 'modification acceptée');
exception when others then
  insert into t_res (test, ok, detail) values ('Écritures immuables', sqlerrm like '%immuable%', sqlerrm);
end $$;

-- Droits : vendeur et chasseur
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', vendor_auth, 'role', 'authenticated')::text, true) from t_ids;
insert into t_res (test, ok, detail)
select 'Vendeur : grand livre invisible', (select count(*) from public.ledger_entries) = 0, 'lignes visibles : ' || (select count(*) from public.ledger_entries);
insert into t_res (test, ok, detail)
select 'Vendeur : voit son solde', count(*) >= 1, count(*) || ' ligne(s)' from public.my_vendor_balance();
do $$ begin
  perform public.pay_vendor((select shop_id from t_ids), 'MAD', 10, 'virement', 'X', 'Moi');
  insert into t_res (test, ok, detail) values ('Vendeur : ne peut pas se reverser', false, 'accepté');
exception when others then
  insert into t_res (test, ok, detail) values ('Vendeur : ne peut pas se reverser', sqlerrm = 'forbidden', sqlerrm);
end $$;
select set_config('request.jwt.claims', json_build_object('sub', hunter_auth, 'role', 'authenticated')::text, true) from t_ids;
insert into t_res (test, ok, detail)
select 'Chasseur : voit son solde (40 MAD)', coalesce(max(balance) filter (where currency = 'MAD'), 0) = 40,
  coalesce(string_agg(currency || '=' || balance, ', '), 'rien') from public.my_hunter_balance();
reset role;

select n, case when ok then 'OK' else 'ÉCHEC' end as resultat, test, detail from t_res order by n;
rollback;
