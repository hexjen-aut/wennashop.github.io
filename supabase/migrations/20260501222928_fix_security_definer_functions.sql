-- ÉTAPE 2 & 3 : Révoquer EXECUTE sur fonctions SECURITY DEFINER pour anon
REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
