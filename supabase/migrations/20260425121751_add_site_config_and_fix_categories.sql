-- ══════════════════════════════════════════════
-- 1. Colonne image_url manquante dans categories
-- ══════════════════════════════════════════════
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- ══════════════════════════════════════════════
-- 2. Table site_config (clé/valeur pour boutique)
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.site_config (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- RLS site_config
ALTER TABLE public.site_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site_config_read_public"  ON public.site_config;
DROP POLICY IF EXISTS "site_config_write_admin"  ON public.site_config;

CREATE POLICY "site_config_read_public" ON public.site_config
  FOR SELECT USING (true);

CREATE POLICY "site_config_write_admin" ON public.site_config
  FOR ALL USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

-- ══════════════════════════════════════════════
-- 3. Valeurs par défaut site_config
-- ══════════════════════════════════════════════
INSERT INTO public.site_config (key, value) VALUES
  ('site_currency',           'MAD'),
  ('shipping_threshold',      '2500'),
  ('shipping_cost',           '120'),
  ('shipping_delay',          '5-12 jours ouvrés'),
  ('reviews_enabled',         'true'),
  ('maintenance_mode',        'false'),
  ('quest_modal_enabled',     'true'),
  ('boutique_banner_enabled', 'false'),
  ('boutique_banner_url',     ''),
  ('boutique_banner_link',    ''),
  ('ticker_messages',         '["Livraison express Casablanca → Libreville","Nouveaux artisans rejoignent WennaShop","Paiements sécurisés · Retours 30 jours"]')
ON CONFLICT (key) DO NOTHING;
