-- Supprimer les profils publics
DELETE FROM public.users
WHERE auth_id IN (
  SELECT id FROM auth.users
  WHERE email NOT IN ('hanamisama74@gmail.com', 'jeremiebandoma0@gmail.com')
);

-- Supprimer les shops liés
DELETE FROM public.shops
WHERE user_id NOT IN (
  SELECT id FROM public.users
);

-- Supprimer les users auth
DELETE FROM auth.users
WHERE email NOT IN ('hanamisama74@gmail.com', 'jeremiebandoma0@gmail.com');
