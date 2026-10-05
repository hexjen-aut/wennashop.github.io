import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Callback SingPay : appelé quand une transaction change de statut.
// À renseigner comme « Callback URL » du portefeuille SingPay :
//   https://<projet>.supabase.co/functions/v1/singpay-webhook
//
// Sécurité : n'importe qui peut appeler cette URL. Le contenu reçu ne sert
// donc qu'à savoir QUELLE transaction regarder ; son statut et son montant
// sont toujours relus auprès de l'API SingPay (search/by-reference) avant
// de valider quoi que ce soit.

const SINGPAY_URL = 'https://gateway.singpay.ga/v1'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function singpayHeaders() {
  return {
    'x-client-id': Deno.env.get('SINGPAY_CLIENT_ID')!,
    'x-client-secret': Deno.env.get('SINGPAY_SECRET')!,
    'x-wallet': Deno.env.get('SINGPAY_WALLET_ID')!,
  }
}

async function singpayGet(path: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${SINGPAY_URL}${path}`, { headers: singpayHeaders() })
  if (!res.ok) {
    console.error('SingPay GET', path, res.status, await res.text())
    return null
  }
  return await res.json()
}

// Transaction telle que SingPay la connaît (source de vérité).
async function fetchTransactionByReference(reference: string) {
  const data = await singpayGet(`/transaction/api/search/by-reference/${encodeURIComponent(reference)}`)
  if (!data) return null
  return ((data.transaction as Record<string, unknown>) || data) as Record<string, unknown>
}

async function referenceFromTransactionId(id: string): Promise<string> {
  const data = await singpayGet(`/transaction/api/status/${encodeURIComponent(id)}`)
  const tx = (data?.transaction || data) as Record<string, unknown> | null
  return (tx?.reference as string) || ''
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  try {
    // SingPay envoie en JSON ou form-urlencoded
    let body: Record<string, unknown> = {}
    const ct = req.headers.get('content-type') || ''
    if (ct.includes('application/json')) {
      body = await req.json()
    } else {
      const text = await req.text()
      for (const pair of text.split('&')) {
        const [k, v] = pair.split('=')
        if (k) body[decodeURIComponent(k)] = decodeURIComponent(v || '')
      }
    }
    console.log('SingPay callback reçu:', JSON.stringify(body))

    const payloadTx = (body.transaction as Record<string, unknown>) || {}
    let reference = (body.reference as string) || (payloadTx.reference as string) || ''
    const transactionId = (body.id as string) || (payloadTx.id as string) || (payloadTx._id as string) || ''
    if (!reference && transactionId) reference = await referenceFromTransactionId(transactionId)
    if (!reference) return json({ error: 'reference manquante' }, 400)

    const { data: payment } = await supabase
      .from('payments')
      .select('id, order_id, amount, status, metadata')
      .eq('provider', 'singpay')
      .eq('metadata->>reference', reference)
      .maybeSingle()

    // 200 pour éviter que SingPay renvoie indéfiniment un callback inconnu
    if (!payment) return json({ message: 'Payment not found, ignored' })
    if (payment.status === 'paid') return json({ message: 'Already processed' })

    // ── Vérification auprès de SingPay ───────────────────────────────
    const tx = await fetchTransactionByReference(reference)
    if (!tx) return json({ error: 'Transaction introuvable chez SingPay' }, 502)

    const walletId = Deno.env.get('SINGPAY_WALLET_ID')
    const pf = tx.portefeuille as Record<string, unknown> | string | undefined
    const txWallet = typeof pf === 'string' ? pf : (pf?.id as string) || (pf?._id as string) || ''
    const checks = {
      reference: tx.reference === reference,
      wallet: !txWallet || !walletId || txWallet === walletId,
      amount: Number(tx.amount) >= Number(payment.amount),
    }

    // SingPay : status=Terminate + result=Success = paiement confirmé.
    // result: Success | PasswordError | BalanceError | TimeOutError | Error
    const finished = tx.status === 'Terminate'
    const success = finished && tx.result === 'Success'
    let newStatus = payment.status
    if (success && checks.reference && checks.wallet && checks.amount) newStatus = 'paid'
    else if (finished && !success) newStatus = 'failed'

    if (success && !(checks.reference && checks.wallet && checks.amount)) {
      console.error('SingPay: paiement réussi mais incohérent, non validé', reference, checks, tx.amount, payment.amount)
    }

    await supabase.from('payments').update({
      status: newStatus,
      transaction_id: (tx.id as string) || (tx._id as string) || undefined,
      updated_at: new Date().toISOString(),
      metadata: {
        ...(payment.metadata as Record<string, unknown> || {}),
        reference,
        last_callback: body,
        singpay_verified: { status: tx.status, result: tx.result, amount: tx.amount, checks, at: new Date().toISOString() },
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
            event: 'payment_confirmed', provider: 'singpay', payment_id: payment.id,
            order_id: payment.order_id, reference, amount: payment.amount, currency: 'XAF',
            timestamp: new Date().toISOString(),
          }),
        }).catch((e) => console.warn('n8n non bloquant:', e))
      }
    }

    return json({ success: true, status: newStatus })
  } catch (err) {
    console.error('SingPay webhook error:', err)
    return json({ error: 'Internal error' }, 500)
  }
})
