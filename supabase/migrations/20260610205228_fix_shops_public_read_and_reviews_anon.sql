-- Shops : lecture publique sans filtre de statut bloquant
DROP POLICY IF EXISTS "shops_public_read" ON shops;
CREATE POLICY "shops_public_read" ON shops
FOR SELECT
USING (status IN ('active', 'pending'));

-- Reviews : lecture publique des avis approuvés sans dépendre du rôle
DROP POLICY IF EXISTS "reviews_select" ON reviews;
CREATE POLICY "reviews_select" ON reviews
FOR SELECT
USING (
  (status = 'approved')
  OR (get_my_role() = 'admin')
);
