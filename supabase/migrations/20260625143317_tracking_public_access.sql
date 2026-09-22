-- Permettre la lecture publique d'une commande via son tracking_number
-- (pour la page de suivi accessible sans connexion)
CREATE POLICY "orders_select_by_tracking" ON orders
  FOR SELECT
  USING (tracking_number IS NOT NULL);

-- Permettre la lecture des order_items pour les commandes publiquement accessibles par tracking
CREATE POLICY "order_items_select_by_tracking" ON order_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
        AND o.tracking_number IS NOT NULL
    )
  );
