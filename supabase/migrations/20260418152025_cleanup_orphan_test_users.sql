-- Suppression des 4 utilisateurs orphelins (sans auth_id = comptes de test)
DELETE FROM public.users
WHERE auth_id IS NULL
  AND email IN (
    'hanamisama@gmail.com',
    'bandomapoathy@gmail.com',
    'magnus.art.jr@gmail.com',
    'MAGNUSJEREMIE10@GMAIL.COM'
  );
