-- Every payment_methods row was marked 'PLANNED' — including cash on
-- delivery and Airtel/Moov Money, which are actually live and working in
-- /paiement today. Only 'card' (Stripe) has never been wired. Also adds
-- a 'virement' row: bank transfer is a real, working method but had no
-- row at all in this table.
update public.payment_methods set status = 'ACTIVE' where code in ('cash_on_delivery', 'airtel_money', 'moov_money');
insert into public.payment_methods (code, name, provider_code, status, sort_order)
values ('virement', 'Virement bancaire', 'manual', 'ACTIVE', (select coalesce(max(sort_order), 0) + 1 from public.payment_methods))
on conflict (code) do nothing;

-- Reflects what /paiement already actually offers today, per country, so
-- the admin "Pays" grid stops being pure decoration: Gabon → paiement à la
-- livraison + Airtel/Moov Money ; Maroc → paiement à la livraison +
-- virement bancaire. Carte bancaire reste désactivée partout (Stripe non
-- branché).
insert into public.country_payment_methods (country_code, payment_method_code, is_enabled) values
  ('GA', 'cash_on_delivery', true),
  ('GA', 'airtel_money', true),
  ('GA', 'moov_money', true),
  ('MA', 'cash_on_delivery', true),
  ('MA', 'virement', true)
on conflict (country_code, payment_method_code) do update set is_enabled = excluded.is_enabled;
