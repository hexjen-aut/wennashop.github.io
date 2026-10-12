import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Remplace le fond d'une photo produit par du blanc (Photoroom).
// Réservé aux vendeurs connectés, avec un quota journalier pour maîtriser le
// coût (~0,02 $ par image). Sans le secret PHOTOROOM_API_KEY, répond 503 et
// le site refuse simplement les photos dont le fond n'est pas blanc.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PHOTOROOM_URL = 'https://sdk.photoroom.com/v1/segment'
const DAILY_LIMIT = 40
const MAX_BYTES = 10 * 1024 * 1024

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const apiKey = Deno.env.get('PHOTOROOM_API_KEY')
    if (!apiKey) return json({ error: "Le détourage automatique n'est pas encore activé. Reprends la photo sur fond blanc." }, 503)

    // ── Auth : vendeur connecté ─────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Non authentifié' }, 401)
    const sbUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user } } = await sbUser.auth.getUser()
    if (!user) return json({ error: 'Session invalide' }, 401)

    const sbAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: me } = await sbAdmin.from('users').select('id, role').eq('auth_id', user.id).maybeSingle()
    if (!me || !['artisan', 'admin'].includes(me.role)) return json({ error: 'Réservé aux vendeurs' }, 403)

    // ── Quota journalier ────────────────────────────────────────
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    const { count } = await sbAdmin.from('image_jobs').select('id', { count: 'exact', head: true })
      .eq('user_id', me.id).gte('created_at', since)
    if ((count ?? 0) >= DAILY_LIMIT) {
      return json({ error: `Limite de ${DAILY_LIMIT} détourages par jour atteinte. Réessaie demain ou utilise une photo sur fond blanc.` }, 429)
    }

    // ── Image reçue ─────────────────────────────────────────────
    const form = await req.formData().catch(() => null)
    const file = form?.get('image_file')
    if (!(file instanceof File) || file.size === 0) return json({ error: 'Image manquante' }, 400)
    if (file.size > MAX_BYTES) return json({ error: 'Image trop lourde (10 Mo maximum)' }, 413)
    if (!file.type.startsWith('image/')) return json({ error: "Ce fichier n'est pas une image" }, 400)

    // ── Photoroom : fond blanc ──────────────────────────────────
    const body = new FormData()
    body.append('image_file', file, file.name || 'photo.jpg')
    body.append('bg_color', 'FFFFFF')
    body.append('format', 'jpg')
    const res = await fetch(PHOTOROOM_URL, { method: 'POST', headers: { 'x-api-key': apiKey }, body })

    await sbAdmin.from('image_jobs').insert({ user_id: me.id, status: res.ok ? 'done' : `error_${res.status}` })

    if (!res.ok) {
      console.error('Photoroom', res.status, await res.text())
      return json({ error: 'Le détourage a échoué. Réessaie ou reprends la photo sur fond blanc.' }, 502)
    }
    return new Response(await res.arrayBuffer(), { headers: { ...CORS, 'Content-Type': 'image/jpeg' } })
  } catch (err) {
    console.error('remove-background error:', err)
    return json({ error: 'Erreur interne' }, 500)
  }
})
