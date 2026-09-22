-- Fonction appelée automatiquement à chaque nouvel utilisateur auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (
    auth_id,
    email,
    first_name,
    last_name,
    full_name,
    country,
    role,
    status,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'country',
    COALESCE(NEW.raw_user_meta_data->>'role', 'buyer'),
    CASE WHEN COALESCE(NEW.raw_user_meta_data->>'role', 'buyer') = 'artisan' THEN 'pending' ELSE 'active' END,
    now(),
    now()
  )
  ON CONFLICT (email) DO UPDATE SET
    auth_id    = EXCLUDED.auth_id,
    first_name = COALESCE(EXCLUDED.first_name, public.users.first_name),
    last_name  = COALESCE(EXCLUDED.last_name, public.users.last_name),
    full_name  = COALESCE(EXCLUDED.full_name, public.users.full_name),
    country    = COALESCE(EXCLUDED.country, public.users.country),
    updated_at = now();

  RETURN NEW;
END;
$$;

-- Supprimer l'ancien trigger s'il existe
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Créer le trigger sur auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
