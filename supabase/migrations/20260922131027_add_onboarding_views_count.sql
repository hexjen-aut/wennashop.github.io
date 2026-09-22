ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS onboarding_views_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.users.onboarding_views_count IS 'Nombre de fois où /bienvenue a été affichée à cet utilisateur. onboarding_completed_at n''est posé qu''après 3 vues.';
