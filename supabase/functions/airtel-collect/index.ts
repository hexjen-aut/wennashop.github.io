import {
  adminClient, airtelConfig, airtelConfigured, airtelFetch, applyResult, enquire, friendlyMessage,
  logAirtel, makeReference, normalizeMsisdn,
} from '../_shared/airtel.ts'
import { CORS, currentUser, json } from '../_shared/http.ts'

// Lance l'encaissement Airtel Money (push USSD : l'acheteur valide avec son
// PIN). Le montant est relu en base ; la commande n'est validée que par le
// callback Airtel ou une vérification de statut, jamais ici.

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!airtelConfigured()) return json({ error: "Airtel Money n'est pas encore disponible." }, 503)

  const sb = adminClient()
  try {
    const me = await currentUser(req, sb)
    if (!me) return json({ error: 'Non authentifié' }, 401)

    const { order_id, msisdn } = await req.json().catch(() => ({})) as { order_id?: string; msisdn?: string }
    if (!order_id) return json({ error: 'order_id requis' }, 400)
    const c = airtelConfig()
    const number = normalizeMsisdn(msisdn ?? '', c.keepZero)
    if (!number) return json({ error: 'Numéro Airtel invalide (ex : 077 12 34 56).' }, 400)

    // Airtel direct doit être le fournisseur choisi dans l'admin
    const { data: method } = await sb.from('payment_methods').select('provider_code, status').eq('code', 'airtel_money').maybeSingle()
    if (method?.provider_code !== 'airtel' || method?.status !== 'ACTIVE') {
      return json({ error: "Airtel Money direct n'est pas activé." }, 409)
    }

    // ── Commande : à moi, en attente, montant relu en base (XAF entiers) ──
    const { data: order } = await sb.from('orders')
      .select('id, user_id, status, total_amount, currency, buyer_total_amount, buyer_currency')
      .eq('id', order_id).maybeSingle()
    if (!order || order.user_id !== me.id) return json({ error: 'Commande introuvable' }, 404)
    if (order.status !== 'pending') return json({ error: 'Commande déjà traitée' }, 409)
    const raw = order.buyer_currency === 'XAF' ? Number(order.buyer_total_amount)
      : order.currency === 'XAF' ? Number(order.total_amount) : NaN
    const amount = Math.round(raw)
    if (!Number.isFinite(amount) || amount <= 0) {
      return json({ error: 'Airtel Money est disponible uniquement pour les commandes en FCFA.' }, 400)
    }

    // ── Paiement existant : une seule ligne « order_payment » par commande ──
    const { data: existing } = await sb.from('payments')
      .select('id, order_id, status, amount, provider, reference, metadata, updated_at')
      .eq('order_id', order_id).eq('type', 'order_payment').maybeSingle()
    if (existing?.status === 'paid') return json({ error: 'Commande déjà payée' }, 409)

    // Tentative Airtel précédente encore ouverte : on regarde chez Airtel avant d'en lancer une autre
    if (existing?.provider === 'airtel' && existing.status === 'pending' && existing.reference) {
      const previous = await enquire(sb, existing.reference)
      const outcome = await applyResult(sb, existing, previous)
      if (outcome === 'paid') return json({ payment_id: existing.id, reference: existing.reference, status: 'paid' })
      const recent = Date.now() - new Date(existing.updated_at).getTime() < 3 * 60_000
      if (outcome === 'pending' && (previous.code === 'TIP' || previous.code === 'TA') && recent) {
        return json({ error: 'Un paiement est déjà en attente : valide-le sur ton téléphone ou patiente 3 minutes.', payment_id: existing.id }, 409)
      }
    }

    const reference = makeReference()
    const requestBody = {
      reference: 'WennaShop',
      subscriber: { country: c.country, currency: c.currency, msisdn: number },
      transaction: { amount, country: c.country, currency: c.currency, id: reference },
    }
    const previousAttempts = Array.isArray((existing?.metadata as Record<string, unknown> | null)?.airtel_attempts)
      ? (existing!.metadata as Record<string, unknown>).airtel_attempts as string[] : []
    const row = {
      order_id, user_id: me.id, amount, currency: 'XAF', method: 'airtel_money', payment_method_code: 'airtel_money',
      provider: 'airtel', type: 'order_payment', status: 'pending', reference, transaction_id: reference,
      msisdn: number, country: c.country, status_code: null, provider_message: null, airtel_money_id: null,
      raw_request: requestBody, raw_callback: null, updated_at: new Date().toISOString(),
      metadata: { ...(existing?.metadata as Record<string, unknown> ?? {}), reference, airtel_attempts: [...previousAttempts, reference].slice(-10) },
    }
    const { data: payment, error: payErr } = existing
      ? await sb.from('payments').update(row).eq('id', existing.id).select('id, order_id, status, amount, metadata').single()
      : await sb.from('payments').insert(row).select('id, order_id, status, amount, metadata').single()
    if (payErr || !payment) {
      await logAirtel(sb, 'error', 'Création du paiement impossible', null, { order_id, error: payErr?.message })
      return json({ error: 'Impossible de préparer le paiement.' }, 500)
    }

    // ── Demande de paiement (push USSD) ──
    const { status, data } = await airtelFetch(sb, c.collectPath, 'POST', requestBody)
    const accepted = status >= 200 && status < 300 && data?.status?.success !== false
    await sb.from('payments').update({
      metadata: { ...(payment.metadata as Record<string, unknown> ?? {}), collect_response: data?.status ?? null },
    }).eq('id', payment.id)

    if (!accepted) {
      const code = data?.status?.response_code ?? data?.status?.code ?? String(status)
      await applyResult(sb, payment, { code: 'TF', airtelMoneyId: null, message: data?.status?.message ?? null, responseCode: code })
      return json({ error: friendlyMessage(code, data?.status?.message), payment_id: payment.id }, 402)
    }

    await logAirtel(sb, 'info', 'Paiement envoyé (push USSD)', status, { payment_id: payment.id, order_id })
    return json({ payment_id: payment.id, reference, status: 'pending' })
  } catch (err) {
    await logAirtel(sb, 'error', 'airtel-collect', null, { error: String(err) })
    return json({ error: 'Le paiement Airtel Money est indisponible pour le moment.' }, 502)
  }
})
