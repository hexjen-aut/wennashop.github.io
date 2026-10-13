import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Mise à jour quotidienne des taux de change (table exchange_rates), appelée
// par pg_cron avec l'en-tête x-cron-secret.
//
// - EUR/MAD et EUR/TND viennent d'une source publique gratuite (une seconde
//   source prend le relais si la première ne répond pas).
// - Le FCFA (XAF et XOF) est arrimé à l'euro : 1 EUR = 655,957 FCFA, fixe.
// - Garde-fou : un taux qui bouge de plus de MAX_CHANGE_PERCENT depuis la
//   dernière valeur n'est pas appliqué ; il est signalé dans system_logs et
//   l'admin le voit. La marge de sécurité (safety_margin_percent) n'est
//   jamais modifiée ici : elle se règle dans l'admin.
//
// Corps optionnel : { "dry_run": true } calcule sans rien écrire.

const EUR_FCFA = 655.957
const MAX_CHANGE_PERCENT = 5

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

type EurRates = { MAD: number; TND: number; source: string }

async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

const valid = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n > 0

async function eurRates(): Promise<EurRates | null> {
  const a = await fetchJson('https://open.er-api.com/v6/latest/EUR')
  const ar = a?.rates as Record<string, number> | undefined
  if (a?.result === 'success' && valid(ar?.MAD) && valid(ar?.TND)) {
    return { MAD: ar!.MAD, TND: ar!.TND, source: 'open.er-api.com' }
  }
  const b = await fetchJson('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/eur.json')
  const br = b?.eur as Record<string, number> | undefined
  if (valid(br?.mad) && valid(br?.tnd)) {
    return { MAD: br!.mad, TND: br!.tnd, source: 'fawazahmed0/currency-api' }
  }
  return null
}

async function log(level: 'info' | 'warning' | 'error', message: string, metadata: Record<string, unknown>) {
  await sb.from('system_logs').insert({ source: 'fx', level, message, metadata })
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  // Même secret que les autres tâches planifiées (vault)
  const { data: allowed } = await sb.rpc('airtel_cron_secret_valid', { p_secret: req.headers.get('x-cron-secret') ?? '' })
  if (allowed !== true) return json({ error: 'Non autorisé' }, 401)

  const body = await req.json().catch(() => ({}))
  const dryRun = body?.dry_run === true

  const eur = await eurRates()
  if (!eur) {
    await log('error', 'Taux de change : aucune source joignable, taux inchangés', {})
    return json({ error: 'Aucune source de taux joignable' }, 502)
  }

  const madXaf = EUR_FCFA / eur.MAD
  const computed: Record<string, number> = {
    MAD_XAF: madXaf,
    MAD_XOF: madXaf,
    XAF_MAD: 1 / madXaf,
    XOF_MAD: 1 / madXaf,
    MAD_TND: eur.TND / eur.MAD,
    TND_MAD: eur.MAD / eur.TND,
  }

  const { data: rows } = await sb.from('exchange_rates').select('id, base_currency, quote_currency, rate')
  const updated: Record<string, { from: number; to: number }> = {}
  const blocked: Record<string, { from: number; to: number; change_percent: number }> = {}

  for (const r of rows || []) {
    const key = `${r.base_currency}_${r.quote_currency}`
    const next = computed[key]
    if (!next) continue
    const prev = Number(r.rate)
    const rounded = Number(next.toPrecision(6))
    const change = prev > 0 ? Math.abs(rounded - prev) / prev * 100 : 0
    if (prev > 0 && change > MAX_CHANGE_PERCENT) {
      blocked[key] = { from: prev, to: rounded, change_percent: Number(change.toFixed(2)) }
      continue
    }
    updated[key] = { from: prev, to: rounded }
    if (!dryRun) {
      await sb.from('exchange_rates')
        .update({ rate: rounded, updated_at: new Date().toISOString(), updated_by: null })
        .eq('id', r.id)
    }
  }

  const result = { dry_run: dryRun, source: eur.source, eur_mad: eur.MAD, eur_tnd: eur.TND, updated, blocked }
  if (!dryRun) {
    if (Object.keys(blocked).length) {
      await log('warning', `Taux de change : variation de plus de ${MAX_CHANGE_PERCENT} % bloquée, à vérifier dans l'admin`, result)
    } else {
      await log('info', 'Taux de change mis à jour', result)
    }
  }
  return json(result)
})
