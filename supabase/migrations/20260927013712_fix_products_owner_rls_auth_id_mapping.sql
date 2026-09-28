-- products_update compared auth.uid() directly to seller_id, but seller_id
-- stores public.users.id (an independent gen_random_uuid()), not the
-- Supabase auth uid, so a seller's own update silently affected 0 rows.
-- products_delete_admin never let sellers delete their own rows at all.
-- Map through users.auth_id, like shops_owner_update already does.

DROP POLICY IF EXISTS products_update ON public.products;
CREATE POLICY products_update ON public.products
FOR UPDATE
USING (
  seller_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
  OR get_my_role() = 'admin'
)
WITH CHECK (
  seller_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
  OR get_my_role() = 'admin'
);

DROP POLICY IF EXISTS products_delete_admin ON public.products;
CREATE POLICY products_delete_seller_or_admin ON public.products
FOR DELETE
USING (
  seller_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
  OR get_my_role() = 'admin'
);
