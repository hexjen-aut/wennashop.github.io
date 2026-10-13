import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Lance une vérification d'identité automatique Didit (document + selfie)
// pour un vendeur ou un chasseur en attente de validation, et renvoie l'URL
// de la page Didit. Le résultat arrive ensuite par didit-webhook.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SITE_URL = 'https://wennashop.com'
const DIDIT_BASE = 'https://verification.didit.me/v3'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const apiKey = Deno.env.get('DIDIT_API_KEY')
    const workflowId = Deno.env.get('DIDIT_WORKFLOW_ID')
    if (!apiKey || !workflowId) {
      return json({ error: "La vérification automatique n'est pas encore disponible. Ton dossier sera vérifié par l'équipe." }, 503)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Non authentifié' }, 401)
    const sbUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user } } = await sbUser.auth.getUser()
    if (!user) return json({ error: 'Session invalide' }, 401)

    const { purpose } = await req.json().catch(() => ({})) as { purpose?: string }
    if (purpose !== 'vendor' && purpose !== 'hunter') return json({ error: 'purpose invalide' }, 400)

    const sbAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: me } = await sbAdmin.from('users')
      .select('id, role, status, hunter_status, kyc_auto_status')
      .eq('auth_id', user.id).maybeSingle()
    if (!me) return json({ error: 'Compte introuvable' }, 404)

    const eligible = purpose === 'vendor'
      ? me.role === 'artisan' && me.status === 'pending'
      : me.hunter_status === 'pending_verification'
    if (!eligible) return json({ error: "Aucune vérification en attente pour ce compte." }, 409)

    const res = await fetch(`${DIDIT_BASE}/session/`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflow_id: workflowId,
        vendor_data: me.id,
        callback: `${SITE_URL}/${purpose === 'vendor' ? 'vendeur' : 'chasseur'}?kyc=done`,
      }),
    })
    const session = await res.json().catch(() => null) as Record<string, unknown> | null
    const sessionId = (session?.session_id ?? session?.id) as string | undefined
    const url = session?.url as string | undefined
    if (!res.ok || !sessionId || !url) {
      console.error('Didit create session', res.status, JSON.stringify(session))
      return json({ error: 'Impossible de lancer la vérification. Réessaie plus tard.' }, 502)
    }

    await sbAdmin.from('users').update({
      kyc_provider: 'didit', kyc_purpose: purpose, kyc_session_id: sessionId,
      kyc_auto_status: 'pending', kyc_auto_reason: null, kyc_checked_at: null,
    }).eq('id', me.id)

    return json({ url })
  } catch (err) {
    console.error('kyc-start error:', err)
    return json({ error: 'Erreur interne' }, 500)
  }
})
