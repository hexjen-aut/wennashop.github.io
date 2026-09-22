-- Supprimer les policies récursives
DROP POLICY IF EXISTS users_select ON users;
DROP POLICY IF EXISTS users_update ON users;

-- Recréer users_select sans récursion
-- L'admin check passe par auth.jwt() au lieu d'une sous-requête sur users
CREATE POLICY users_select ON users
  FOR SELECT
  USING (
    auth_id = auth.uid()
    OR role = 'artisan'
    OR (auth.jwt() ->> 'role') = 'admin'
    OR EXISTS (
      SELECT 1 FROM auth.users au
      WHERE au.id = auth.uid()
        AND au.raw_user_meta_data ->> 'role' = 'admin'
    )
  );

-- Recréer users_update sans récursion
CREATE POLICY users_update ON users
  FOR UPDATE
  USING (
    auth_id = auth.uid()
    OR (auth.jwt() ->> 'role') = 'admin'
    OR EXISTS (
      SELECT 1 FROM auth.users au
      WHERE au.id = auth.uid()
        AND au.raw_user_meta_data ->> 'role' = 'admin'
    )
  );
