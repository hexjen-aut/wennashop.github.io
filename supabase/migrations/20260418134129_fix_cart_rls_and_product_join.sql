-- Ajouter une policy qui permet de lire les produits depuis cart_items
-- même si le produit est "pending" (l'acheteur doit voir ce qu'il a mis dans son panier)
DROP POLICY IF EXISTS "cart_products_readable" ON products;

CREATE POLICY "cart_products_readable" ON products
FOR SELECT
USING (
  -- Produit actif : visible par tous
  status = 'active'
  OR
  -- Produit dans le panier de l'utilisateur connecté : toujours visible
  id IN (
    SELECT ci.product_id FROM cart_items ci
    JOIN users u ON u.id = ci.user_id
    WHERE u.auth_id = auth.uid()
  )
  OR
  -- Vendeur voit ses propres produits
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.auth_id = auth.uid() AND u.id = products.seller_id
  )
);
