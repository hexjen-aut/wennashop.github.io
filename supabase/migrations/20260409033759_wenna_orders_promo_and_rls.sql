-- ═══════════════════════════════════════════════════════════
-- 1. ORDERS — colonnes manquantes pour le panier
-- ═══════════════════════════════════════════════════════════
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS promo_code    text,
  ADD COLUMN IF NOT EXISTS discount_pct  numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency      text    DEFAULT 'MAD',
  ADD COLUMN IF NOT EXISTS subtotal      numeric DEFAULT 0;

-- ═══════════════════════════════════════════════════════════
-- 2. REVIEWS — colonne reviewer_name (affiché côté client)
-- ═══════════════════════════════════════════════════════════
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS reviewer_name text;

-- ═══════════════════════════════════════════════════════════
-- 3. PRODUCTS — colonnes tags pour les chips detail_produit
-- ═══════════════════════════════════════════════════════════
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS tag1   text,
  ADD COLUMN IF NOT EXISTS tag2   text,
  ADD COLUMN IF NOT EXISTS origin text;

-- ═══════════════════════════════════════════════════════════
-- 4. RLS POLICIES — orders
-- ═══════════════════════════════════════════════════════════

-- Lecture : chaque user voit ses propres commandes
DROP POLICY IF EXISTS "orders_select_own" ON public.orders;
CREATE POLICY "orders_select_own" ON public.orders
  FOR SELECT USING (
    auth.uid() = (
      SELECT auth_id FROM public.users WHERE id = user_id LIMIT 1
    )
  );

-- Insert : un user authentifié peut créer une commande pour lui-même
DROP POLICY IF EXISTS "orders_insert_own" ON public.orders;
CREATE POLICY "orders_insert_own" ON public.orders
  FOR INSERT WITH CHECK (
    auth.uid() = (
      SELECT auth_id FROM public.users WHERE id = user_id LIMIT 1
    )
  );

-- Update : uniquement par admin (role admin dans users)
DROP POLICY IF EXISTS "orders_update_admin" ON public.orders;
CREATE POLICY "orders_update_admin" ON public.orders
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE auth_id = auth.uid() AND role = 'admin'
    )
  );

-- ═══════════════════════════════════════════════════════════
-- 5. RLS POLICIES — order_items
-- ═══════════════════════════════════════════════════════════

-- Select : voir ses propres items
DROP POLICY IF EXISTS "order_items_select_own" ON public.order_items;
CREATE POLICY "order_items_select_own" ON public.order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      JOIN public.users u ON u.id = o.user_id
      WHERE o.id = order_id AND u.auth_id = auth.uid()
    )
  );

-- Insert : lié à une commande qui appartient à l'user
DROP POLICY IF EXISTS "order_items_insert_own" ON public.order_items;
CREATE POLICY "order_items_insert_own" ON public.order_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      JOIN public.users u ON u.id = o.user_id
      WHERE o.id = order_id AND u.auth_id = auth.uid()
    )
  );

-- ═══════════════════════════════════════════════════════════
-- 6. RLS POLICIES — reviews (lecture publique, écriture auth)
-- ═══════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "reviews_select_approved" ON public.reviews;
CREATE POLICY "reviews_select_approved" ON public.reviews
  FOR SELECT USING (status = 'approved');

DROP POLICY IF EXISTS "reviews_insert_auth" ON public.reviews;
CREATE POLICY "reviews_insert_auth" ON public.reviews
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ═══════════════════════════════════════════════════════════
-- 7. RLS POLICIES — products (lecture publique des actifs)
-- ═══════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "products_select_active" ON public.products;
CREATE POLICY "products_select_active" ON public.products
  FOR SELECT USING (status = 'active');

-- Vendeur voit ses propres produits même inactifs
DROP POLICY IF EXISTS "products_select_own" ON public.products;
CREATE POLICY "products_select_own" ON public.products
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = seller_id AND auth_id = auth.uid()
    )
  );

-- ═══════════════════════════════════════════════════════════
-- 8. INDEX utiles pour les performances
-- ═══════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_orders_user_id       ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_reviews_product_id   ON public.reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_products_seller_id   ON public.products(seller_id);
CREATE INDEX IF NOT EXISTS idx_products_status      ON public.products(status);
