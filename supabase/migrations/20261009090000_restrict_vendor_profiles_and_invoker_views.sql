-- Corrige 2 erreurs du conseiller de sécurité Supabase (vues en SECURITY
-- DEFINER) et une fuite de données qu'elles masquaient.
--
-- Fuite : la policy users_select laissait tout compte connecté lire la ligne
-- complète des vendeurs actifs (email, adresse, chemins des pièces
-- d'identité, coordonnées de paiement…). Le site n'a besoin que du profil
-- public, déjà défini par la vue vendors_public.

-- 1. product_ratings : la policy reviews_select laisse déjà lire les avis
--    approuvés à tout le monde, la vue peut donc s'exécuter avec les droits
--    de l'appelant sans rien changer pour le site.
alter view public.product_ratings set (security_invoker = true);

-- 2. Profil public des vendeurs : seules ces colonnes sortent, via une
--    fonction SECURITY DEFINER au search_path fixé. La vue garde son nom et
--    ses colonnes pour les appels existants, mais s'exécute désormais avec
--    les droits de l'appelant.
create or replace function public.public_vendor_profiles()
returns table (
  id uuid,
  full_name text,
  first_name text,
  country text,
  city text,
  role text,
  status text,
  avatar_url text,
  specialty text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.full_name, u.first_name, u.country, u.city, u.role, u.status,
         u.avatar_url, u.specialty, u.created_at
  from public.users u
  where u.role = 'artisan' and u.status = 'active'
$$;

revoke all on function public.public_vendor_profiles() from public;
grant execute on function public.public_vendor_profiles() to anon, authenticated;

create or replace view public.vendors_public with (security_invoker = true) as
  select * from public.public_vendor_profiles();
grant select on public.vendors_public to anon, authenticated;

-- 3. users : chacun ne lit plus que sa propre ligne (l'admin lit tout).
alter policy users_select on public.users
  using (auth_id = (select auth.uid()) or public.get_my_role() = 'admin');
