DROP POLICY IF EXISTS "products_select" ON products;

CREATE POLICY "products_select" ON products
FOR SELECT
USING (
  (status = 'active')
  OR (auth.uid() = seller_id)
  OR (get_my_role() = 'admin')
);
