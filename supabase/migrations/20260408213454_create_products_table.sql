CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  stock INTEGER DEFAULT 0,
  country TEXT CHECK (country IN ('Gabon','Maroc')),
  origin_city TEXT,
  image_url TEXT,
  images TEXT[],
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','active','inactive')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read active products" ON public.products FOR SELECT USING (status = 'active');
CREATE POLICY "Seller insert products" ON public.products FOR INSERT WITH CHECK (true);
CREATE POLICY "Seller update own products" ON public.products FOR UPDATE USING (true);
CREATE POLICY "Admin delete products" ON public.products FOR DELETE USING (true);
