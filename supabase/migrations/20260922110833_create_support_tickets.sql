CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  name text,
  email text,
  subject text,
  message text NOT NULL,
  page_url text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_tickets_status ON public.support_tickets(status, created_at DESC);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can submit a ticket" ON public.support_tickets
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "admin can view tickets" ON public.support_tickets
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.users WHERE auth_id = (select auth.uid()) AND role = 'admin'));

CREATE POLICY "admin can update tickets" ON public.support_tickets
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.users WHERE auth_id = (select auth.uid()) AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE auth_id = (select auth.uid()) AND role = 'admin'));

CREATE TRIGGER support_tickets_updated_at
BEFORE UPDATE ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION update_updated_at();
