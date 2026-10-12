import { adminClient, airtelConfig, airtelConfigured, airtelFetch, logAirtel, maskName, normalizeMsisdn } from '../_shared/airtel.ts'
import { CORS, currentUser, json } from '../_shared/http.ts'

// Vérifie qu'un numéro est un compte Airtel Money et renvoie le nom du
// titulaire masqué (« J*** D*** »), affiché avant de confirmer le paiement.

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!airtelConfigured()) return json({ error: "Airtel Money n'est pas encore disponible." }, 503)

  const sb = adminClient()
  try {
    const me = await currentUser(req, sb)
    if (!me) return json({ error: 'Non authentifié' }, 401)

    const { msisdn } = await req.json().catch(() => ({})) as { msisdn?: string }
    const c = airtelConfig()
    const number = normalizeMsisdn(msisdn ?? '', c.keepZero)
    if (!number) return json({ error: 'Numéro Airtel invalide (ex : 077 12 34 56).' }, 400)

    const { status, data } = await airtelFetch(sb, `${c.kycPath}${number}`, 'GET')
    const user = data?.data
    if (status === 404 || !user || data?.status?.success === false) {
      return json({ error: "Ce numéro n'est pas un compte Airtel Money." }, 404)
    }
    return json({
      name: maskName(user.first_name, user.last_name),
      is_barred: user.is_barred === true || user.is_barred === 'true',
    })
  } catch (err) {
    await logAirtel(sb, 'error', 'airtel-kyc', null, { error: String(err) })
    return json({ error: 'Vérification du numéro impossible pour le moment.' }, 502)
  }
})
