import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// Utilisateur connecté (ligne public.users) à partir du JWT de la requête
export async function currentUser(req: Request, admin: ReturnType<typeof createClient>) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return null
  const sbUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user } } = await sbUser.auth.getUser()
  if (!user) return null
  const { data: row } = await admin.from('users').select('id, email').eq('auth_id', user.id).maybeSingle()
  return row
}
