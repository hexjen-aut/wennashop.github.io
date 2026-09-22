CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT UNIQUE,
  icon TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read categories" ON public.categories FOR SELECT USING (true);
CREATE POLICY "Admin insert categories" ON public.categories FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin update categories" ON public.categories FOR UPDATE USING (true);
CREATE POLICY "Admin delete categories" ON public.categories FOR DELETE USING (true);

-- Données de base
INSERT INTO public.categories (name, slug, icon, description) VALUES
  ('Textile',    'textile',    '🧵', 'Tissus, vêtements et accessoires artisanaux'),
  ('Céramique',  'ceramique',  '🏺', 'Poteries et objets en céramique'),
  ('Bijoux',     'bijoux',     '💎', 'Bijoux et ornements traditionnels'),
  ('Art',        'art',        '🎨', 'Peintures, sculptures et objets décoratifs'),
  ('Alimentation','alimentation','🌿', 'Épices, huiles et produits alimentaires'),
  ('Maison',     'maison',     '🏠', 'Décoration et mobilier artisanal')
ON CONFLICT (name) DO NOTHING;
