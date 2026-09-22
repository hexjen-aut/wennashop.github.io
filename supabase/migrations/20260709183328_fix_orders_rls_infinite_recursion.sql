-- Supprimer les policies qui causent la récursion
DROP POLICY IF EXISTS orders_select_seller ON orders;
DROP POLICY IF EXISTS orders_update_seller ON orders;

-- Fonction SECURITY DEFINER : casse la boucle car elle bypass RLS
CREATE OR REPLACE FUNCTION is_order_seller(order_id_param uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    JOIN users u ON u.id = p.seller_id
    WHERE oi.order_id = order_id_param AND u.auth_id = auth.uid()
  );
$$;

-- Recréer les policies en utilisant la fonction (plus de requête directe sur order_items dans la policy)
CREATE POLICY orders_select_seller ON orders
FOR SELECT
USING (is_order_seller(id));

CREATE POLICY orders_update_seller ON orders
FOR UPDATE
USING (is_order_seller(id))
WITH CHECK (is_order_seller(id));
