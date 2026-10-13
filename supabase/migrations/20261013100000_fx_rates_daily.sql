-- Taux de change : correction et mise à jour quotidienne automatique.
--
-- Les taux étaient figés depuis le 22/08/2026 (1 MAD = 65 FCFA,
-- 1 FCFA = 0,0154 MAD). Le second était trop bas : un acheteur au Maroc
-- payait un produit en FCFA environ 3,6 % sous sa valeur réelle, marge
-- comprise. On repart des taux du marché du 13/10/2026
-- (1 EUR = 10,85672 MAD, 1 EUR = 3,359898 TND, 1 EUR = 655,957 FCFA fixe).
-- La marge (safety_margin_percent) ne change pas.

update public.exchange_rates set rate = 60.4194, updated_at = now(), updated_by = null
  where base_currency = 'MAD' and quote_currency in ('XAF', 'XOF');
update public.exchange_rates set rate = 0.016551, updated_at = now(), updated_by = null
  where base_currency in ('XAF', 'XOF') and quote_currency = 'MAD';
update public.exchange_rates set rate = 0.309476, updated_at = now(), updated_by = null
  where base_currency = 'MAD' and quote_currency = 'TND';
update public.exchange_rates set rate = 3.23126, updated_at = now(), updated_by = null
  where base_currency = 'TND' and quote_currency = 'MAD';

-- Ensuite, la fonction fx-rates-update les met à jour chaque jour à 05:13 UTC
-- (même secret de coffre que les autres tâches planifiées). Une variation de
-- plus de 5 % en un jour n'est pas appliquée et apparaît dans l'admin.
select cron.schedule(
  'fx-rates-daily',
  '13 5 * * *',
  $cron$
  select net.http_post(
    url := 'https://aakxoydznmybstfozjte.supabase.co/functions/v1/fx-rates-update',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'airtel_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cron$
);
