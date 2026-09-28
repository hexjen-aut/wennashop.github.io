-- Same auth.uid()-vs-users.id mismatch as products_update. Postgres also
-- checks the NEW row of an UPDATE against the SELECT policy, so a seller
-- setting status = 'inactive' failed with "new row violates row-level
-- security policy" (no clause left true for a non-admin seller).

DROP POLICY IF EXISTS products_select ON public.products;
CREATE POLICY products_select ON public.products
FOR SELECT
USING (
  status = 'active'
  OR seller_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
  OR get_my_role() = 'admin'
);
