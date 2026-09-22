-- ORDERS
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','processing','shipped','delivered','cancelled','returned')),
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  shipping_name TEXT,
  shipping_address TEXT,
  shipping_country TEXT,
  shipping_city TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own orders" ON public.orders FOR SELECT USING (true);
CREATE POLICY "Users insert orders" ON public.orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Users update own orders" ON public.orders FOR UPDATE USING (true);

-- ORDER ITEMS
CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read order items" ON public.order_items FOR SELECT USING (true);
CREATE POLICY "Insert order items" ON public.order_items FOR INSERT WITH CHECK (true);

-- PAYMENTS
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  amount DECIMAL(10,2) NOT NULL,
  method TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','refunded')),
  transaction_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read payments" ON public.payments FOR SELECT USING (true);
CREATE POLICY "Insert payments" ON public.payments FOR INSERT WITH CHECK (true);
CREATE POLICY "Update payments" ON public.payments FOR UPDATE USING (true);

-- REVIEWS
CREATE TABLE IF NOT EXISTS public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read approved reviews" ON public.reviews FOR SELECT USING (status = 'approved');
CREATE POLICY "Insert reviews" ON public.reviews FOR INSERT WITH CHECK (true);
CREATE POLICY "Update reviews" ON public.reviews FOR UPDATE USING (true);

-- NEWSLETTER
CREATE TABLE IF NOT EXISTS public.newsletter (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  source TEXT DEFAULT 'site',
  subscribed_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.newsletter ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Insert newsletter" ON public.newsletter FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin read newsletter" ON public.newsletter FOR SELECT USING (true);
