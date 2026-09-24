-- Même logique que vendor_tour_completed_at : flag dédié pour le tuto
-- interactif chasseur (/chasseur), indépendant de onboarding_completed_at
-- (3 premières connexions de /bienvenue).
--
-- Pas d'équivalent "buyer_tour_completed_at" : /boutique n'a pas de session
-- utilisateur chargée (page publique, accessible aux invités), donc le tuto
-- acheteur se base sur localStorage plutôt que d'ajouter un aller-retour
-- Supabase dédié sur une page à fort trafic.
alter table public.users add column if not exists hunter_tour_completed_at timestamptz;
