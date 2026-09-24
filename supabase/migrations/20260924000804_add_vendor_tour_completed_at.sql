-- Sépare le flag du tuto interactif vendeur (tableau de bord réel) de
-- onboarding_completed_at, qui gère l'affichage des 3 premières connexions
-- de /bienvenue. Les deux partageaient la même colonne, donc refuser ou
-- terminer le tuto vendeur dès la 1ère visite coupait court à /bienvenue
-- pour les connexions 2 et 3.
alter table public.users add column if not exists vendor_tour_completed_at timestamptz;
