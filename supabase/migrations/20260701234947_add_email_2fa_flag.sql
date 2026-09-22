ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email_2fa_enabled boolean DEFAULT false;
