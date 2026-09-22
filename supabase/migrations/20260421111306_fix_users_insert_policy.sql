-- Remplace la policy INSERT pour permettre l'insertion sans auth_id déjà défini
-- (nécessaire car auth.uid() est disponible même lors d'un signUp)
DROP POLICY IF EXISTS "users_insert_own" ON public.users;

CREATE POLICY "users_insert_own" ON public.users
  FOR INSERT
  WITH CHECK (auth_id = auth.uid());
