-- L'admin lit le journal applicatif (taux de change bloqués, refus SingPay,
-- erreurs Airtel…). Personne d'autre : écriture réservée aux fonctions serveur.
create policy system_logs_select_admin on public.system_logs
  for select to authenticated
  using (public.get_my_role() = 'admin');
