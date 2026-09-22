-- Recréer get_my_role en SECURITY DEFINER pour bypasser le RLS sur users
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM public.users WHERE auth_id = auth.uid() LIMIT 1;
$$;

-- Fixer products_select : remplacer la sous-requête users par get_my_role()
DROP POLICY IF EXISTS products_select ON products;
CREATE POLICY products_select ON products
  FOR SELECT
  USING (
    status = 'active'
    OR auth.uid() = seller_id
    OR get_my_role() = 'admin'
  );

-- Fixer products_update
DROP POLICY IF EXISTS products_update ON products;
CREATE POLICY products_update ON products
  FOR UPDATE
  USING (
    auth.uid() = seller_id
    OR get_my_role() = 'admin'
  );

-- Fixer products_delete_admin
DROP POLICY IF EXISTS products_delete_admin ON products;
CREATE POLICY products_delete_admin ON products
  FOR DELETE
  USING (get_my_role() = 'admin');

-- Fixer users_select : utiliser get_my_role() à la place de la sous-requête récursive
DROP POLICY IF EXISTS users_select ON users;
CREATE POLICY users_select ON users
  FOR SELECT
  USING (
    auth_id = auth.uid()
    OR role = 'artisan'
    OR get_my_role() = 'admin'
  );

-- Fixer users_update
DROP POLICY IF EXISTS users_update ON users;
CREATE POLICY users_update ON users
  FOR UPDATE
  USING (
    auth_id = auth.uid()
    OR get_my_role() = 'admin'
  );
