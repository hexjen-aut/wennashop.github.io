-- ============================================
-- SUPPRESSION DES POLICIES DUPLIQUÉES
-- On garde les versions "_own" / "_admin" et on supprime les doublons génériques
-- ============================================

-- ORDERS
DROP POLICY IF EXISTS "Users insert orders" ON public.orders;
DROP POLICY IF EXISTS "Users read own orders" ON public.orders;
DROP POLICY IF EXISTS "Users update own orders" ON public.orders;

-- ORDER_ITEMS
DROP POLICY IF EXISTS "Insert order items" ON public.order_items;
DROP POLICY IF EXISTS "Public read order items" ON public.order_items;

-- PAYMENTS
DROP POLICY IF EXISTS "Insert payments" ON public.payments;
DROP POLICY IF EXISTS "Public read payments" ON public.payments;
DROP POLICY IF EXISTS "Update payments" ON public.payments;

-- PRODUCTS — garder: products_insert_seller, products_select_own, products_select_admin, products_select_active, products_update_own, products_update_admin
DROP POLICY IF EXISTS "Seller insert products" ON public.products;
DROP POLICY IF EXISTS "Public read active products" ON public.products;
DROP POLICY IF EXISTS "Seller update own products" ON public.products;
DROP POLICY IF EXISTS "Admin delete products" ON public.products;
DROP POLICY IF EXISTS "cart_products_readable" ON public.products;
DROP POLICY IF EXISTS "products_update_seller" ON public.products;

-- Recréer une policy DELETE propre pour admin
CREATE POLICY "products_delete_admin" ON public.products
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.auth_id = auth.uid() AND users.role = 'admin'
    )
  );

-- REVIEWS
DROP POLICY IF EXISTS "Insert reviews" ON public.reviews;
DROP POLICY IF EXISTS "Update reviews" ON public.reviews;
DROP POLICY IF EXISTS "Public read approved reviews" ON public.reviews;

-- ============================================
-- CORRECTION policy INSERT users
-- Avant : aucune vérification — n'importe qui peut créer un profil pour quelqu'un d'autre
-- Après : l'auth_id inséré doit correspondre à l'utilisateur connecté
-- ============================================
DROP POLICY IF EXISTS "Users insert own profile" ON public.users;

CREATE POLICY "users_insert_own" ON public.users
  FOR INSERT WITH CHECK (
    auth_id = auth.uid()
  );
