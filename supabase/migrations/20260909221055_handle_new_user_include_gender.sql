CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    gender,
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
    COALESCE(NEW.raw_user_meta_data->>'gender', 'non_precise'),
    now(),
    now()
  )
  ON CONFLICT (email) DO UPDATE SET
    auth_id    = EXCLUDED.auth_id,
    first_name = COALESCE(EXCLUDED.first_name, public.users.first_name),
    last_name  = COALESCE(EXCLUDED.last_name, public.users.last_name),
    full_name  = COALESCE(EXCLUDED.full_name, public.users.full_name),
    country    = COALESCE(EXCLUDED.country, public.users.country),
    gender     = COALESCE(EXCLUDED.gender, public.users.gender),
    updated_at = now();

  RETURN NEW;
END;
$function$;
