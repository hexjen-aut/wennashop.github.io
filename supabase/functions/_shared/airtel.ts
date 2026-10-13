// Module partagé Airtel Money (API Airtel Africa) pour les fonctions
// airtel-kyc, airtel-collect, airtel-callback et airtel-status.
// Aucun secret ne quitte le serveur ; jetons, PIN et secrets ne sont jamais
// écrits dans les journaux.
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Buffer } from 'node:buffer'
import { constants, createCipheriv, publicEncrypt, randomBytes } from 'node:crypto'
import { mapTransactionStatus } from './airtel_utils.ts'

export * from './airtel_utils.ts'

const env = (k: string) => Deno.env.get(k) ?? ''

export function airtelConfig() {
  return {
    base: env('AIRTEL_BASE_URL').replace(/\/+$/, ''),
    clientId: env('AIRTEL_CLIENT_ID'),
    clientSecret: env('AIRTEL_CLIENT_SECRET'),
    country: env('AIRTEL_COUNTRY') || 'GA',
    currency: env('AIRTEL_CURRENCY') || 'XAF',
    // Chemins selon la version activée sur le compte (à confirmer dans le portail)
    collectPath: env('AIRTEL_COLLECT_PATH') || '/merchant/v2/payments/',
    enquiryPath: env('AIRTEL_ENQUIRY_PATH') || '/standard/v1/payments/',
    kycPath: env('AIRTEL_KYC_PATH') || '/standard/v1/users/',
    messageSigning: env('AIRTEL_MESSAGE_SIGNING') === 'true',
    keepZero: env('AIRTEL_MSISDN_KEEP_ZERO') === 'true',
    // Relais à IP fixe (webhook n8n) : Airtel n'accepte que les IP déclarées
    // dans le portail, et les fonctions Supabase n'ont pas d'IP fixe.
    relayUrl: env('AIRTEL_RELAY_URL'),
    relayKey: env('AIRTEL_RELAY_KEY'),
  }
}

export const airtelConfigured = () => {
  const c = airtelConfig()
  return Boolean(c.base && c.clientId && c.clientSecret && (!c.relayUrl || c.relayKey))
}

// Appel HTTP vers Airtel, en direct ou via le relais. Le relais reçoit la
// requête telle quelle (corps brut, pour ne pas casser la signature) et
// renvoie { status, body } de la réponse Airtel.
async function airtelHttp(
  method: 'GET' | 'POST', path: string, headers: Record<string, string>, body?: string,
): Promise<{ status: number; data: Record<string, any> }> {
  const c = airtelConfig()
  if (c.relayUrl) {
    const res = await fetch(c.relayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Relay-Key': c.relayKey },
      body: JSON.stringify({ base: c.base, method, path, headers, bodyRaw: body ?? null }),
    })
    const out = await res.json().catch(() => null) as { status?: number; body?: unknown } | null
    if (!res.ok || !out) return { status: res.status >= 400 ? res.status : 502, data: {} }
    let data: unknown = out.body ?? {}
    if (typeof data === 'string') { try { data = JSON.parse(data) } catch { data = {} } }
    return { status: Number(out.status) || 502, data: (data ?? {}) as Record<string, any> }
  }
  const res = await fetch(`${c.base}${path}`, { method, headers, body })
  return { status: res.status, data: await res.json().catch(() => ({})) as Record<string, any> }
}

export const adminClient = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

// Journal applicatif (table system_logs) — jamais de jeton, PIN ni secret
export async function logAirtel(
  sb: SupabaseClient, level: 'info' | 'warn' | 'error', message: string,
  statusCode?: number | null, metadata?: Record<string, unknown>,
) {
  try {
    await sb.from('system_logs').insert({ source: 'airtel', level, message, status_code: statusCode ?? null, metadata: metadata ?? null })
  } catch (_) { /* un journal ne doit jamais casser un paiement */ }
}

// ── Jeton OAuth (client_credentials), mis en cache en base ──────────
export async function getToken(sb: SupabaseClient): Promise<string> {
  const { data: cached } = await sb.from('airtel_tokens').select('access_token, expires_at').eq('id', 1).maybeSingle()
  if (cached && new Date(cached.expires_at).getTime() - Date.now() > 60_000) return cached.access_token

  const c = airtelConfig()
  const { status, data: body } = await airtelHttp('POST', '/auth/oauth2/token',
    { 'Content-Type': 'application/json', Accept: '*/*' },
    JSON.stringify({ client_id: c.clientId, client_secret: c.clientSecret, grant_type: 'client_credentials' }))
  if (status < 200 || status >= 300 || typeof body.access_token !== 'string') {
    await logAirtel(sb, 'error', 'Jeton OAuth Airtel refusé', status)
    throw new Error('airtel_auth_failed')
  }
  const ttl = Number(body.expires_in) || 180
  await sb.from('airtel_tokens').upsert({
    id: 1, access_token: body.access_token, expires_at: new Date(Date.now() + ttl * 1000).toISOString(), updated_at: new Date().toISOString(),
  })
  return body.access_token
}

// Signature des messages (Collection v2+, si activée sur le compte) :
// corps chiffré en AES-256-CBC (x-signature) ; clé et IV chiffrés en RSA avec
// la clé publique Airtel (x-key). À valider en UAT : le format exact peut
// varier selon la version de l'API.
function signedHeaders(payload: string): Record<string, string> {
  const pem = env('AIRTEL_RSA_PUBLIC_KEY')
  if (!pem) throw new Error('AIRTEL_RSA_PUBLIC_KEY manquant pour la signature des messages')
  const key = randomBytes(32)
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-cbc', key, iv)
  const signature = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]).toString('base64')
  const keyIv = `${key.toString('base64')}:${iv.toString('base64')}`
  const xKey = publicEncrypt({ key: toPem(pem), padding: constants.RSA_PKCS1_PADDING }, Buffer.from(keyIv)).toString('base64')
  return { 'x-signature': signature, 'x-key': xKey }
}

// PIN de décaissement chiffré en RSA (phase 2)
export function encryptPin(pin: string): string {
  const pem = env('AIRTEL_RSA_PUBLIC_KEY')
  if (!pem) throw new Error('AIRTEL_RSA_PUBLIC_KEY manquant')
  return publicEncrypt({ key: toPem(pem), padding: constants.RSA_PKCS1_PADDING }, Buffer.from(pin)).toString('base64')
}

function toPem(key: string): string {
  if (key.includes('BEGIN')) return key.replace(/\\n/g, '\n')
  const body = key.replace(/\s+/g, '').match(/.{1,64}/g)?.join('\n') ?? key
  return `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----`
}

export async function airtelFetch(
  sb: SupabaseClient, path: string, method: 'GET' | 'POST', body?: unknown,
): Promise<{ status: number; data: Record<string, any> }> {
  const c = airtelConfig()
  const token = await getToken(sb)
  const payload = body === undefined ? undefined : JSON.stringify(body)
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: '*/*',
    'X-Country': c.country,
    'X-Currency': c.currency,
  }
  if (payload && c.messageSigning) Object.assign(headers, signedHeaders(payload))
  const { status, data } = await airtelHttp(method, path, headers, payload)
  if (status < 200 || status >= 300) await logAirtel(sb, 'warn', `Airtel ${method} ${path.split('/').slice(0, 4).join('/')}`, status, { status: data?.status })
  return { status, data }
}

// Statut d'une transaction chez Airtel (source de vérité)
export async function enquire(sb: SupabaseClient, reference: string) {
  const c = airtelConfig()
  const { status, data } = await airtelFetch(sb, `${c.enquiryPath}${encodeURIComponent(reference)}`, 'GET')
  const tx = data?.data?.transaction ?? {}
  return {
    httpStatus: status,
    code: (tx.status ?? null) as string | null, // TS / TF / TE / TA / TIP
    airtelMoneyId: (tx.airtel_money_id ?? null) as string | null,
    message: (tx.message ?? data?.status?.message ?? null) as string | null,
    responseCode: (data?.status?.response_code ?? null) as string | null,
  }
}

type PaymentRow = { id: string; order_id: string | null; status: string; amount: number; metadata: Record<string, unknown> | null }

// Applique un résultat Airtel à un paiement. Idempotent : un paiement déjà
// payé / échoué / remboursé n'est jamais modifié.
export async function applyResult(
  sb: SupabaseClient, payment: PaymentRow,
  result: { code: string | null; airtelMoneyId: string | null; message: string | null; responseCode?: string | null },
  extra: Record<string, unknown> = {},
): Promise<'paid' | 'failed' | 'pending' | 'unchanged'> {
  if (payment.status !== 'pending') return 'unchanged'
  const next = mapTransactionStatus(result.code)

  const update: Record<string, unknown> = {
    status_code: result.code ?? result.responseCode ?? null,
    provider_message: result.message,
    ...extra,
  }
  if (result.airtelMoneyId) update.airtel_money_id = result.airtelMoneyId
  // updated_at ne bouge qu'au statut final : il date la tentative (expiration à 15 min)
  if (next !== 'pending') { update.status = next; update.updated_at = new Date().toISOString() }

  // Garde « status = pending » : deux appels simultanés ne valident qu'une fois
  const { data: changed } = await sb.from('payments').update(update).eq('id', payment.id).eq('status', 'pending').select('id')
  if (!changed?.length) return 'unchanged'

  if (next === 'paid' && payment.order_id) {
    await sb.from('orders').update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', payment.order_id).eq('status', 'pending')
    const n8nUrl = Deno.env.get('N8N_WEBHOOK_URL')
    if (n8nUrl) {
      fetch(n8nUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'payment_confirmed', provider: 'airtel', payment_id: payment.id, order_id: payment.order_id,
          amount: payment.amount, currency: 'XAF', timestamp: new Date().toISOString(),
        }),
      }).catch(() => {})
    }
  }
  if (next !== 'pending') {
    await logAirtel(sb, next === 'failed' ? 'warn' : 'info', `Paiement ${next}`, null, { payment_id: payment.id, code: result.code })
  }
  return next
}

// Phase 2 — décaissements vers les vendeurs : non activé.
export function disburse(): never {
  throw new Error('Décaissements Airtel : phase 2, non activés')
}
