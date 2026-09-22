CREATE TABLE IF NOT EXISTS public.cart_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity    integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  added_at    timestamptz DEFAULT now(),
  UNIQUE (user_id, product_id)
);

ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

-- L'utilisateur ne voit que son propre panier
CREATE POLICY "cart_select_own" ON public.cart_items
  FOR SELECT USING (
    user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
  );

CREATE POLICY "cart_insert_own" ON public.cart_items
  FOR INSERT WITH CHECK (
    user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
  );

CREATE POLICY "cart_update_own" ON public.cart_items
  FOR UPDATE USING (
    user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
  );

CREATE POLICY "cart_delete_own" ON public.cart_items
  FOR DELETE USING (
    user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
  );
