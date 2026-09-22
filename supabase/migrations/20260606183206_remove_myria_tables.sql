-- Supprimer dans l'ordre (enfants avant parents)
DROP TABLE IF EXISTS public.myria_commandes_items CASCADE;
DROP TABLE IF EXISTS public.myria_envois CASCADE;
DROP TABLE IF EXISTS public.myria_commandes CASCADE;
DROP TABLE IF EXISTS public.myria_produits CASCADE;

-- Supprimer les séquences
DROP SEQUENCE IF EXISTS myria_produits_id_seq;
DROP SEQUENCE IF EXISTS myria_commandes_id_seq;
DROP SEQUENCE IF EXISTS myria_commandes_items_id_seq;
DROP SEQUENCE IF EXISTS myria_envois_id_seq;
