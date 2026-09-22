-- Table shops : vitrine publique de chaque artisan
CREATE TABLE IF NOT EXISTS public.shops (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  name              text NOT NULL,
  slug              text NOT NULL UNIQUE,
  logo_url          text,
  banner_url        text,
  bio               text CHECK (char_length(bio) <= 500),
  city              text,
  country           text,
  ships_to          text[] DEFAULT '{}',
  whatsapp          text,
  instagram         text,
  facebook          text,
  tiktok            text,
  shop_policies     text,
  opening_hours     jsonb,
  is_verified       boolean DEFAULT false,
  status            text DEFAULT 'active' CHECK (status = ANY (ARRAY['active','inactive','suspended'])),
  commission_rate   numeric DEFAULT 10,
  total_sales       integer DEFAULT 0,
  total_revenue     numeric DEFAULT 0,
  rating_avg        numeric DEFAULT 0,
  rating_count      integer DEFAULT 0,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;

-- Lecture publique
CREATE POLICY "shops_public_read" ON public.shops
  FOR SELECT USING (status = 'active');

-- Vendeur lit sa propre boutique même inactive
CREATE POLICY "shops_owner_read" ON public.shops
  FOR SELECT USING (
    user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
  );

-- Vendeur crée sa boutique
CREATE POLICY "shops_owner_insert" ON public.shops
  FOR INSERT WITH CHECK (
    user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
  );

-- Vendeur met à jour sa boutique
CREATE POLICY "shops_owner_update" ON public.shops
  FOR UPDATE USING (
    user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
  );

-- Admin tout accès
CREATE POLICY "shops_admin_all" ON public.shops
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE auth_id = auth.uid() AND role = 'admin')
  );

-- Index
CREATE INDEX IF NOT EXISTS shops_slug_idx ON public.shops(slug);
CREATE INDEX IF NOT EXISTS shops_user_id_idx ON public.shops(user_id);
CREATE INDEX IF NOT EXISTS shops_country_idx ON public.shops(country);
