import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Lance un paiement Mobile Money SingPay (USSD push Airtel / Moov, ou lien
// de paiement externe). La commande n'est validée que plus tard, par le
// callback singpay-webhook, après vérification auprès de SingPay.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BASE_URL = 'https://gateway.singpay.ga/v1'
const SITE_URL = 'https://wennashop.com'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // ── 1. Auth JWT ──────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Non authentifié' }, 401)

    const sbUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await sbUser.auth.getUser()
    if (authError || !user) return json({ error: 'Session invalide' }, 401)

    const sbAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── 2. User interne ──────────────────────────────────────────
    const { data: userRow } = await sbAdmin
      .from('users').select('id, full_name').eq('auth_id', user.id).single()
    if (!userRow) return json({ error: 'Utilisateur introuvable' }, 404)

    // ── 3. Body ──────────────────────────────────────────────────
    // Le montant envoyé par le navigateur est ignoré : il est relu en base.
    const body = await req.json()
    const { order_id, client_msisdn, payment_method = 'mobile_money' } = body
    if (!order_id) return json({ error: 'order_id requis' }, 400)

    // ── 4. Vérifier commande ─────────────────────────────────────
    const { data: order } = await sbAdmin
      .from('orders')
      .select('id, user_id, status, total_amount, currency, buyer_total_amount, buyer_currency')
      .eq('id', order_id)
      .single()
    if (!order || order.user_id !== userRow.id) return json({ error: 'Commande introuvable' }, 404)
    if (order.status !== 'pending') return json({ error: 'Commande déjà traitée' }, 409)

    // SingPay encaisse en FCFA (XAF) : on prend le montant facturé à
    // l'acheteur s'il est en XAF, sinon le montant vendeur s'il l'est.
    const amount = order.buyer_currency === 'XAF' ? Number(order.buyer_total_amount)
      : order.currency === 'XAF' ? Number(order.total_amount)
      : NaN
    if (!Number.isFinite(amount) || amount <= 0) {
      return json({ error: 'Le paiement Mobile Money est disponible uniquement pour les commandes en FCFA.' }, 400)
    }

    // Un seul paiement « order_payment » par commande (index unique) : une
    // nouvelle tentative réutilise la ligne existante, sauf si déjà payée.
    const { data: existing } = await sbAdmin
      .from('payments').select('id, status')
      .eq('order_id', order_id).eq('type', 'order_payment').maybeSingle()
    if (existing?.status === 'paid') return json({ error: 'Commande déjà payée' }, 409)

    const clientId     = Deno.env.get('SINGPAY_CLIENT_ID')!
    const clientSecret = Deno.env.get('SINGPAY_SECRET')!
    const walletId     = Deno.env.get('SINGPAY_WALLET_ID')!
    const headers = {
      'Content-Type':    'application/json',
      'x-client-id':     clientId,
      'x-client-secret': clientSecret,
      'x-wallet':        walletId,
    }

    // Référence unique par tentative (SingPay refuse une référence déjà
    // utilisée) ; le callback retrouve le paiement grâce à elle.
    const reference = `WENNA-${order_id.replace(/-/g, '').slice(0, 12).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`
    const roundedAmount = Math.round(amount)

    // ── 5. USSD Push (numéro fourni) ou lien externe ─────────────
    let singpayRes: Response
    if (client_msisdn && (payment_method === 'airtel_money' || payment_method === 'moov_money')) {
      const operator = payment_method === 'airtel_money' ? '74' : '62'
      singpayRes = await fetch(`${BASE_URL}/${operator}/paiement`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          amount: roundedAmount, reference, client_msisdn,
          portefeuille: walletId, disbursement: '', isTransfer: false,
        }),
      })
    } else {
      singpayRes = await fetch(`${BASE_URL}/ext`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          portefeuille: walletId, reference,
          redirect_success: `${SITE_URL}/suivi?order=${order_id}`,
          redirect_error: `${SITE_URL}/paiement?order_id=${order_id}&error=payment_failed`,
          amount: roundedAmount, disbursement: '',
          logoURL: `${SITE_URL}/wenna_icon.png`, isTransfer: false,
        }),
      })
    }

    if (!singpayRes.ok) {
      const errText = await singpayRes.text()
      console.error('SingPay error:', errText)
      return json({ error: 'Erreur SingPay', detail: errText }, 502)
    }
    const singpayData = await singpayRes.json()

    // ── 6. transaction_id et payment_url ─────────────────────────
    const tx = (singpayData?.transaction || {}) as Record<string, unknown>
    const transaction_id = (tx.id as string) || (tx._id as string) || reference
    const payment_url = (singpayData?.link as string) || ''
    const exp = (singpayData?.exp as string) || ''

    // ── 7. Enregistrer le paiement ───────────────────────────────
    const paymentRow = {
      order_id,
      user_id: userRow.id,
      amount: roundedAmount,
      currency: 'XAF',
      method: payment_method,
      status: 'pending',
      transaction_id,
      provider: 'singpay',
      type: 'order_payment',
      updated_at: new Date().toISOString(),
      metadata: { reference, payment_url, exp, singpay_response: singpayData },
    }
    const { data: payment, error: payError } = existing
      ? await sbAdmin.from('payments').update(paymentRow).eq('id', existing.id).select('id').single()
      : await sbAdmin.from('payments').insert([paymentRow]).select('id').single()
    if (payError) {
      console.error('Payment save error:', payError)
      return json({ error: 'Erreur enregistrement paiement' }, 500)
    }

    // ── 8. Webhook n8n (non bloquant) ────────────────────────────
    const n8nUrl = Deno.env.get('N8N_WEBHOOK_URL')
    if (n8nUrl) {
      fetch(n8nUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'payment_initiated', provider: 'singpay', order_id, payment_id: payment.id,
          transaction_id, amount: roundedAmount, currency: 'XAF', reference,
          user_email: user.email, timestamp: new Date().toISOString(),
        }),
      }).catch((e) => console.warn('n8n non bloquant:', e))
    }

    // ── 9. Réponse ───────────────────────────────────────────────
    return json({
      success: true, provider: 'singpay', payment_id: payment.id, transaction_id, reference,
      order_status: 'pending', payment_url: payment_url || null, exp: exp || null,
    })
  } catch (err) {
    console.error('Edge Function error:', err)
    return json({ error: 'Erreur serveur interne' }, 500)
  }
})
