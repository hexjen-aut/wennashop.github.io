-- ═══════════════════════════════════════════════
-- 1. PAYMENTS — colonnes manquantes
-- ═══════════════════════════════════════════════
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS currency     text DEFAULT 'MAD',
  ADD COLUMN IF NOT EXISTS provider     text DEFAULT 'stripe',
  ADD COLUMN IF NOT EXISTS metadata     jsonb;

-- ═══════════════════════════════════════════════
-- 2. RLS POLICIES — payments
-- ═══════════════════════════════════════════════
DROP POLICY IF EXISTS "payments_select_own"  ON public.payments;
CREATE POLICY "payments_select_own" ON public.payments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      JOIN public.users u ON u.id = o.user_id
      WHERE o.id = order_id AND u.auth_id = auth.uid()
    )
  );

-- Insert uniquement via service_role (Edge Function) — pas depuis le front
DROP POLICY IF EXISTS "payments_insert_service" ON public.payments;
CREATE POLICY "payments_insert_service" ON public.payments
  FOR INSERT WITH CHECK (
    auth.role() = 'service_role'
  );

-- ═══════════════════════════════════════════════
-- 3. INDEX
-- ═══════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON public.payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status   ON public.payments(status);
