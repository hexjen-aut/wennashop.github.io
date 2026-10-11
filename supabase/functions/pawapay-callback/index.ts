import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Callback pawaPay des dépôts. À déclarer dans le tableau de bord pawaPay :
//   https://<projet>.supabase.co/functions/v1/pawapay-callback
//
// Sécurité : n'importe qui peut appeler cette URL. Le contenu reçu ne sert
// qu'à savoir QUEL dépôt regarder ; son statut, son montant et sa devise sont
// toujours relus auprès de l'API pawaPay avant de valider quoi que ce soit.

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Dépôt tel que pawaPay le connaît (source de vérité).
async function fetchDeposit(depositId: string): Promise<Record<string, unknown> | null> {
  const token = Deno.env.get('PAWAPAY_API_TOKEN')
  if (!token) return null
  const base = (Deno.env.get('PAWAPAY_BASE_URL') || 'https://api.sandbox.pawapay.io').replace(/\/+$/, '')
  const res = await fetch(`${base}/v2/deposits/${encodeURIComponent(depositId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    console.error('pawaPay GET deposit', depositId, res.status, await res.text())
    return null
  }
  const body = await res.json()
  if (body?.status !== 'FOUND' || !body?.data) return null
  return body.data as Record<string, unknown>
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    console.log('pawaPay callback reçu:', JSON.stringify(body))

    const depositId = typeof body.depositId === 'string' ? body.depositId : ''
    if (!UUID_RE.test(depositId)) return json({ error: 'depositId manquant ou invalide' }, 400)

    const { data: payment } = await supabase
      .from('payments')
      .select('id, order_id, amount, status, metadata')
      .eq('provider', 'pawapay')
      .eq('transaction_id', depositId)
      .maybeSingle()

    // 200 pour éviter que pawaPay renvoie indéfiniment un callback inconnu
    if (!payment) return json({ message: 'Payment not found, ignored' })
    if (payment.status === 'paid') return json({ message: 'Already processed' })

    // ── Vérification auprès de pawaPay ───────────────────────────────
    const deposit = await fetchDeposit(depositId)
    if (!deposit) return json({ error: 'Dépôt introuvable chez pawaPay' }, 502)

    const checks = {
      depositId: deposit.depositId === depositId,
      currency: deposit.currency === 'XAF',
      amount: Number(deposit.amount) >= Number(payment.amount),
    }
    const completed = deposit.status === 'COMPLETED'
    let newStatus = payment.status
    if (completed && checks.depositId && checks.currency && checks.amount) newStatus = 'paid'
    else if (deposit.status === 'FAILED') newStatus = 'failed'

    if (completed && newStatus !== 'paid') {
      console.error('pawaPay: dépôt COMPLETED mais incohérent, non validé', depositId, checks, deposit.amount, payment.amount)
    }

    await supabase.from('payments').update({
      status: newStatus,
      updated_at: new Date().toISOString(),
      metadata: {
        ...(payment.metadata as Record<string, unknown> || {}),
        last_callback: body,
        pawapay_verified: {
          status: deposit.status, amount: deposit.amount, currency: deposit.currency,
          failureReason: deposit.failureReason ?? null, checks, at: new Date().toISOString(),
        },
      },
    }).eq('id', payment.id)

    if (newStatus === 'paid' && payment.order_id) {
      await supabase.from('orders')
        .update({ status: 'processing', updated_at: new Date().toISOString() })
        .eq('id', payment.order_id)
        .eq('status', 'pending')

      const n8nUrl = Deno.env.get('N8N_WEBHOOK_URL')
      if (n8nUrl) {
        fetch(n8nUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'payment_confirmed', provider: 'pawapay', payment_id: payment.id,
            order_id: payment.order_id, reference: depositId, amount: payment.amount, currency: 'XAF',
            timestamp: new Date().toISOString(),
          }),
        }).catch((e) => console.warn('n8n non bloquant:', e))
      }
    }

    return json({ success: true, status: newStatus })
  } catch (err) {
    console.error('pawaPay callback error:', err)
    return json({ error: 'Internal error' }, 500)
  }
})
