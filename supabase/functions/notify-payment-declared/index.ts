import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Paiement manuel déclaré par un client → message à l'équipe (n8n → Telegram
// Team-wenna). Appelée par le déclencheur trg_payments_notify_declared avec
// l'en-tête x-cron-secret (secret du coffre).
//
// Secrets : N8N_PAYMENT_WEBHOOK_URL (obligatoire pour envoyer),
//           N8N_PAYMENT_WEBHOOK_KEY (en-tête X-Webhook-Key, recommandé).

const SITE_URL = 'https://wennashop.com'
const METHOD_LABEL: Record<string, string> = {
  airtel_money: 'Airtel Money', moov_money: 'Moov Money', virement: 'Virement bancaire',
}

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

async function log(level: 'info' | 'warning' | 'error', message: string, metadata: Record<string, unknown>) {
  await sb.from('system_logs').insert({ source: 'payments', level, message, metadata })
}

const money = (n: number, c: string) =>
  `${Number(n).toLocaleString('fr-FR')} ${c === 'XAF' || c === 'XOF' ? 'FCFA' : c}`

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const { data: allowed } = await sb.rpc('airtel_cron_secret_valid', { p_secret: req.headers.get('x-cron-secret') ?? '' })
  if (allowed !== true) return json({ error: 'Non autorisé' }, 401)

  const { payment_id } = await req.json().catch(() => ({}))
  if (!payment_id) return json({ error: 'payment_id requis' }, 400)

  const { data: p } = await sb.from('payments')
    .select('id, order_id, reference, payment_method_code, amount, currency, transaction_id, sender_number, proof_path, declared_at, verification_status, users(first_name, last_name, full_name, email)')
    .eq('id', payment_id).maybeSingle()
  if (!p || p.verification_status !== 'declared') return json({ skipped: 'not_declared' })

  const url = Deno.env.get('N8N_PAYMENT_WEBHOOK_URL')
  if (!url) {
    await log('warning', 'Paiement déclaré : N8N_PAYMENT_WEBHOOK_URL absent, équipe non prévenue', { payment_id, reference: p.reference })
    return json({ skipped: 'no_webhook' })
  }

  const u = (p.users || {}) as Record<string, string | null>
  const client = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.full_name || u.email || '—'
  const method = METHOD_LABEL[p.payment_method_code] || p.payment_method_code
  const adminUrl = `${SITE_URL}/admin/paiements?id=${p.id}`
  const text = [
    `Paiement à vérifier — ${p.reference}`,
    `Montant : ${money(p.amount, p.currency)}`,
    `Moyen : ${method}`,
    `ID transaction : ${p.transaction_id}`,
    `Numéro émetteur : ${p.sender_number || '—'}`,
    `Client : ${client}`,
    p.proof_path ? 'Capture jointe' : 'Pas de capture',
    adminUrl,
  ].join('\n')

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const key = Deno.env.get('N8N_PAYMENT_WEBHOOK_KEY')
  if (key) headers['X-Webhook-Key'] = key

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        event: 'payment_declared',
        payment_id: p.id, order_id: p.order_id, reference: p.reference,
        amount: p.amount, currency: p.currency, method, transaction_id: p.transaction_id,
        sender_number: p.sender_number, client, has_proof: !!p.proof_path,
        declared_at: p.declared_at, admin_url: adminUrl, text,
      }),
    })
    if (!res.ok) {
      await log('error', `Paiement déclaré : n8n a répondu ${res.status}`, { payment_id, reference: p.reference })
      return json({ error: 'n8n' }, 502)
    }
  } catch (e) {
    await log('error', 'Paiement déclaré : n8n injoignable', { payment_id, reference: p.reference, detail: String(e).slice(0, 300) })
    return json({ error: 'n8n' }, 502)
  }
  return json({ sent: true })
})
