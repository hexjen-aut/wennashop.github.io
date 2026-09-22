update public.payment_providers
set status = 'PLANNED',
    notes = 'Aucune intégration réelle dans le code (vérifié le 17/09) — nécessite un compte Stripe, des clés API et un vrai développement du tunnel de paiement carte. Le statut ACTIVE précédent était incorrect.',
    updated_at = now()
where code = 'stripe';
