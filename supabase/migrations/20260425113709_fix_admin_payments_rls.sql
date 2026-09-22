-- Policy SELECT admin sur payments (manquante)
CREATE POLICY "payments_select_admin" ON payments
  FOR SELECT USING (get_my_role() = 'admin');

-- Policy UPDATE admin sur payments
CREATE POLICY "payments_update_admin" ON payments
  FOR UPDATE USING (get_my_role() = 'admin');
