-- Activer realtime sur les 3 tables Myria
ALTER PUBLICATION supabase_realtime ADD TABLE public.myria_produits;
ALTER PUBLICATION supabase_realtime ADD TABLE public.myria_commandes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.myria_envois;
