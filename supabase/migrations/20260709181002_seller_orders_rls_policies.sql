CREATE POLICY orders_select_seller ON orders
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    JOIN users u ON u.id = p.seller_id
    WHERE oi.order_id = orders.id AND u.auth_id = auth.uid()
  )
);

CREATE POLICY orders_update_seller ON orders
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    JOIN users u ON u.id = p.seller_id
    WHERE oi.order_id = orders.id AND u.auth_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    JOIN users u ON u.id = p.seller_id
    WHERE oi.order_id = orders.id AND u.auth_id = auth.uid()
  )
);
