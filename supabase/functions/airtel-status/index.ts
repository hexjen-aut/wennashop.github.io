import { adminClient, airtelConfigured, applyResult, enquire, friendlyMessage, logAirtel } from '../_shared/airtel.ts'
import { CORS, currentUser, json } from '../_shared/http.ts'

// Vérification du statut d'un paiement Airtel :
//  - par l'acheteur (bouton « Vérifier le statut ») : { payment_id } + JWT ;
//  - par pg_cron toutes les 2 min (« sweep ») : en-tête x-cron-secret. Relance
//    les paiements en attente depuis plus de 2 min et clôt (TE) ceux restés
//    sans réponse 15 min.
// verify_jwt est désactivé pour le mode cron ; le mode acheteur vérifie le JWT lui-même.

const EXPIRE_AFTER_MS = 15 * 60_000

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!airtelConfigured()) return json({ error: "Airtel Money n'est pas encore disponible." }, 503)

  const sb = adminClient()
  try {
    const body = await req.json().catch(() => ({})) as { payment_id?: string; sweep?: boolean }

    // ── Mode cron ──
    if (body.sweep) {
      const { data: valid } = await sb.rpc('airtel_cron_secret_valid', { p_secret: req.headers.get('x-cron-secret') ?? '' })
      if (valid !== true) return json({ error: 'Non autorisé' }, 401)
      const { data: pending } = await sb.from('payments')
        .select('id, order_id, status, amount, metadata, reference, updated_at')
        .eq('provider', 'airtel').eq('status', 'pending')
        .lt('updated_at', new Date(Date.now() - 2 * 60_000).toISOString())
        .order('updated_at', { ascending: true }).limit(25)
      let checked = 0
      for (const p of pending ?? []) {
        if (!p.reference) continue
        const result = await enquire(sb, p.reference)
        const outcome = await applyResult(sb, p, result)
        if (outcome === 'pending' && Date.now() - new Date(p.updated_at).getTime() > EXPIRE_AFTER_MS) {
          await applyResult(sb, p, { code: 'TE', airtelMoneyId: null, message: 'Aucune réponse après 15 minutes' })
        }
        checked++
      }
      return json({ checked })
    }

    // ── Mode acheteur ──
    const me = await currentUser(req, sb)
    if (!me) return json({ error: 'Non authentifié' }, 401)
    if (!body.payment_id) return json({ error: 'payment_id requis' }, 400)
    const { data: payment } = await sb.from('payments')
      .select('id, user_id, order_id, status, amount, metadata, reference, status_code, provider_message')
      .eq('id', body.payment_id).eq('provider', 'airtel').maybeSingle()
    if (!payment || payment.user_id !== me.id) return json({ error: 'Paiement introuvable' }, 404)

    if (payment.status === 'pending' && payment.reference) {
      const result = await enquire(sb, payment.reference)
      const outcome = await applyResult(sb, payment, result)
      if (outcome === 'paid' || outcome === 'failed') {
        return json({ status: outcome, message: outcome === 'failed' ? friendlyMessage(result.code, result.message) : null })
      }
      return json({ status: 'pending', message: null })
    }
    return json({
      status: payment.status,
      message: payment.status === 'failed' ? friendlyMessage(payment.status_code, payment.provider_message) : null,
    })
  } catch (err) {
    await logAirtel(sb, 'error', 'airtel-status', null, { error: String(err) })
    return json({ error: 'Vérification impossible pour le moment.' }, 502)
  }
})
