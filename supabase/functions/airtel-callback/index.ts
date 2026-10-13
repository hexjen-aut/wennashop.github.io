import { adminClient, airtelConfigured, applyResult, enquire, logAirtel } from '../_shared/airtel.ts'

// Callback Airtel Money (public, verify_jwt désactivé). À déclarer dans le
// portail Airtel : https://<projet>.supabase.co/functions/v1/airtel-callback
//
// Payload : { transaction: { id, message, status_code, airtel_money_id }, hash? }
// Si AIRTEL_CALLBACK_HASH_KEY est défini, le hash HMAC-SHA256 est vérifié.
// Dans tous les cas, le statut est relu chez Airtel avant de valider quoi que
// ce soit ; un callback reçu deux fois ne change rien (idempotent).

const ok = (body: unknown = { ok: true }) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

async function hmacBase64(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)))
  return btoa(String.fromCharCode(...sig))
}

function safeEqual(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const sb = adminClient()
  try {
    const raw = await req.text()
    let body: Record<string, any>
    try { body = JSON.parse(raw) } catch { return new Response('Bad request', { status: 400 }) }

    const hashKey = Deno.env.get('AIRTEL_CALLBACK_HASH_KEY')
    if (hashKey) {
      const expected = await hmacBase64(hashKey, JSON.stringify(body.transaction ?? {}))
      if (!safeEqual(String(body.hash ?? ''), expected)) {
        await logAirtel(sb, 'warn', 'Callback rejeté : hash invalide', 401)
        return new Response('Unauthorized', { status: 401 })
      }
    }

    const tx = body.transaction ?? {}
    const reference = typeof tx.id === 'string' ? tx.id : ''
    if (!reference || !airtelConfigured()) return ok({ ignored: true })

    // Référence actuelle, ou d'une tentative précédente du même paiement
    let { data: payment } = await sb.from('payments')
      .select('id, order_id, status, amount, metadata').eq('provider', 'airtel').eq('reference', reference).maybeSingle()
    if (!payment) {
      ({ data: payment } = await sb.from('payments')
        .select('id, order_id, status, amount, metadata').eq('provider', 'airtel')
        .contains('metadata', { airtel_attempts: [reference] }).maybeSingle())
    }
    if (!payment) return ok({ ignored: true })

    await sb.from('payments').update({ raw_callback: body }).eq('id', payment.id)
    if (payment.status !== 'pending') return ok({ already: payment.status })

    // Vérité côté Airtel, pas le contenu du callback
    const result = await enquire(sb, reference)
    const outcome = await applyResult(sb, payment, result)
    return ok({ status: outcome })
  } catch (err) {
    await logAirtel(sb, 'error', 'airtel-callback', null, { error: String(err) })
    return ok({ error: true }) // toujours 200 : Airtel ne doit pas boucler
  }
})
