-- Supprimer les 4 policies cart_items qui utilisent auth.uid() = user_id (UUID mismatch)
DROP POLICY IF EXISTS "cart_insert_own" ON public.cart_items;
DROP POLICY IF EXISTS "cart_select_own" ON public.cart_items;
DROP POLICY IF EXISTS "cart_update_own" ON public.cart_items;
DROP POLICY IF EXISTS "cart_delete_own" ON public.cart_items;

-- Recréer avec la bonne logique : auth.uid() → users.auth_id → users.id = cart_items.user_id
CREATE POLICY "cart_insert_own" ON public.cart_items
  FOR INSERT
  WITH CHECK (
    user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
  );

CREATE POLICY "cart_select_own" ON public.cart_items
  FOR SELECT
  USING (
    user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
  );

CREATE POLICY "cart_update_own" ON public.cart_items
  FOR UPDATE
  USING (
    user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
  );

CREATE POLICY "cart_delete_own" ON public.cart_items
  FOR DELETE
  USING (
    user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
  );
