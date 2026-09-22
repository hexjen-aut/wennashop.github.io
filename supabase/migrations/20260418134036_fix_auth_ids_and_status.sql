-- 1. Corriger les auth_id manquants en matchant par email
UPDATE users SET auth_id = 'bcf2c00b-ca5d-4798-998e-12a5b8deae50'
WHERE email = 'magnusjeremie02@gmail.com' AND auth_id IS NULL;

UPDATE users SET auth_id = 'ffa0b685-5576-45db-81d2-607b61a424a8'
WHERE email = 'magnusjeremie03@gmail.com' AND auth_id IS NULL;

-- hanamisama74 a déjà son auth_id (même id dans users et auth.users)
-- mais son auth_id dans users est l'id users, pas auth.users → corriger
UPDATE users SET auth_id = '5681fafa-91e7-4e0a-a614-1fd840469c1e'
WHERE email = 'hanamisama74@gmail.com';

-- 2. Activer tous les vendeurs artisan (statut pending → active)
UPDATE users SET status = 'active' WHERE role = 'artisan' AND status = 'pending';
