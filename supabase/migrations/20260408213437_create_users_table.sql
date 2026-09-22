CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE,
  full_name TEXT,
  first_name TEXT,
  last_name TEXT,
  country TEXT,
  role TEXT DEFAULT 'buyer' CHECK (role IN ('buyer','artisan','admin')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active','inactive','pending','banned')),
  avatar_url TEXT,
  specialty TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read users" ON public.users FOR SELECT USING (true);
CREATE POLICY "Users insert own profile" ON public.users FOR INSERT WITH CHECK (true);
CREATE POLICY "Users update own profile" ON public.users FOR UPDATE USING (true);
