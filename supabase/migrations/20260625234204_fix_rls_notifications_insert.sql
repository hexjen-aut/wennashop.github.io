-- ============================================================
-- PATCH 2 : notif_insert_system
-- Avant : with_check = true → n'importe qui peut insérer
-- Après : seul le système (admin) ou l'utilisateur lui-même
-- ============================================================
DROP POLICY IF EXISTS "notif_insert_system" ON public.notifications;

CREATE POLICY "notif_insert_system"
ON public.notifications
FOR INSERT
WITH CHECK (
  get_my_role() = 'admin'
  OR user_id IN (
    SELECT id FROM public.users WHERE auth_id = auth.uid()
  )
);
