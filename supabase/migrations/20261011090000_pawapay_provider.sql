-- pawaPay : agrégateur mobile money, en ligne au Gabon pour Airtel Money
-- (Moov pas encore). process-payment choisit le fournisseur d'un moyen de
-- paiement d'après payment_methods.provider_code, réglable dans l'admin.
insert into public.payment_providers (code, name, kind, supports_collect, supports_payout, status, notes)
values (
  'pawapay', 'pawaPay', 'aggregator', true, true, 'PLANNED',
  'Airtel Money Gabon (AIRTEL_GAB, XAF). Moov Gabon pas encore proposé. Nécessite le secret PAWAPAY_API_TOKEN et l''URL de callback des dépôts : /functions/v1/pawapay-callback.'
)
on conflict (code) do nothing;

-- Les deux moyens mobile money passent aujourd'hui par SingPay : on aligne
-- provider_code sur la réalité (valeurs historiques moneroo / moov_gabon).
update public.payment_methods set provider_code = 'singpay', updated_at = now()
where code in ('airtel_money', 'moov_money') and provider_code <> 'singpay';
