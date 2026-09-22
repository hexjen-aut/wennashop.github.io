-- ============================================================
-- PATCH 1 : orders_select_by_tracking
-- Avant : tracking_number IS NOT NULL → expose TOUTES les commandes
-- Après : limité aux champs publics de suivi uniquement
-- ============================================================
DROP POLICY IF EXISTS "orders_select_by_tracking" ON public.orders;

CREATE POLICY "orders_select_by_tracking"
ON public.orders
FOR SELECT
USING (
  tracking_number IS NOT NULL
  AND tracking_number = current_setting('request.jwt.claims', true)::json->>'tracking_number'
);
