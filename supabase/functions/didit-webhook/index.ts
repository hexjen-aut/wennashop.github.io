import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Webhook Didit : résultat d'une vérification d'identité lancée par kyc-start.
// À déclarer dans la console Didit :
//   https://<projet>.supabase.co/functions/v1/didit-webhook
//
// Sécurité : signature HMAC vérifiée (secret DIDIT_WEBHOOK_SECRET) puis la
// décision est toujours relue chez Didit avec notre clé API ; le contenu reçu
// ne sert qu'à savoir quelle session regarder.
//
// Approuvé et nom cohérent avec le profil : le vendeur (ou le chasseur) est
// validé automatiquement. Refusé ou douteux : le dossier reste en validation
// manuelle dans l'admin, avec le motif.

const DIDIT_BASE = 'https://verification.didit.me/v3'
const MAX_SKEW_SECONDS = 300

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const enc = new TextEncoder()

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function safeEqual(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// JSON aux clés triées, compact, Unicode conservé (forme signée par X-Signature-V2)
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

async function signatureValid(req: Request, raw: string, body: unknown, secret: string): Promise<boolean> {
  const ts = req.headers.get('x-timestamp')
  if (ts && Math.abs(Date.now() / 1000 - Number(ts)) > MAX_SKEW_SECONDS) return false
  const v1 = req.headers.get('x-signature') || ''
  const v2 = req.headers.get('x-signature-v2') || ''
  if (v2 && safeEqual(v2, await hmacHex(secret, canonical(body)))) return true
  if (v1 && safeEqual(v1, await hmacHex(secret, raw))) return true
  return false
}

// Mots d'un nom, sans accents ni casse, de 3 lettres et plus
function nameTokens(...parts: unknown[]): Set<string> {
  return new Set(parts.filter((p) => typeof p === 'string').join(' ')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .split(/[^a-z]+/).filter((t) => t.length >= 3))
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  try {
    const secret = Deno.env.get('DIDIT_WEBHOOK_SECRET')
    const apiKey = Deno.env.get('DIDIT_API_KEY')
    if (!secret || !apiKey) return json({ error: 'Didit non configuré' }, 503)

    const raw = await req.text()
    let body: Record<string, unknown>
    try { body = JSON.parse(raw) } catch { return json({ error: 'JSON invalide' }, 400) }
    if (!(await signatureValid(req, raw, body, secret))) return json({ error: 'Signature invalide' }, 401)

    const sessionId = typeof body.session_id === 'string' ? body.session_id : ''
    if (!sessionId) return json({ message: 'Pas de session, ignoré' })

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: user } = await supabase.from('users')
      .select('id, role, status, hunter_status, full_name, first_name, last_name, kyc_purpose')
      .eq('kyc_session_id', sessionId).maybeSingle()
    // 200 pour que Didit ne renvoie pas indéfiniment une session inconnue
    if (!user) return json({ message: 'Session inconnue, ignorée' })

    // ── Décision relue chez Didit (source de vérité) ──────────────
    const res = await fetch(`${DIDIT_BASE}/session/${encodeURIComponent(sessionId)}/decision/`, {
      headers: { 'x-api-key': apiKey },
    })
    if (!res.ok) {
      console.error('Didit decision', sessionId, res.status, await res.text())
      return json({ error: 'Décision introuvable chez Didit' }, 502)
    }
    const decision = await res.json() as Record<string, unknown>
    if (decision.vendor_data && decision.vendor_data !== user.id) {
      console.error('Didit: vendor_data ne correspond pas', sessionId)
      return json({ error: 'Session incohérente' }, 409)
    }

    const status = String(decision.status || '').toUpperCase().replace(/\s+/g, '_')
    const idv = (Array.isArray(decision.id_verifications) ? decision.id_verifications[0]
      : decision.id_verification) as Record<string, unknown> | undefined
    const warnings = (Array.isArray(idv?.warnings) ? idv!.warnings : []) as Record<string, unknown>[]
    const firstWarning = warnings.map((w) => w.short_description || w.risk).find(Boolean) as string | undefined

    let autoStatus: 'pending' | 'approved' | 'declined' | 'review' = 'pending'
    let reason: string | null = null
    if (status === 'APPROVED') {
      // Le nom du document doit recouper celui du profil
      const docNames = nameTokens(idv?.full_name, idv?.first_name, idv?.last_name)
      const profileNames = nameTokens(user.full_name, user.first_name, user.last_name)
      const match = [...docNames].some((t) => profileNames.has(t))
      if (match || profileNames.size === 0) {
        autoStatus = 'approved'
      } else {
        autoStatus = 'review'
        reason = `Nom sur le document différent du profil : ${[idv?.first_name, idv?.last_name].filter(Boolean).join(' ') || 'inconnu'}`
      }
    } else if (status === 'DECLINED') {
      autoStatus = 'declined'
      reason = firstWarning || 'Vérification refusée par Didit'
    } else if (status === 'IN_REVIEW' || status === 'RESUBMITTED') {
      autoStatus = 'review'
      reason = firstWarning || 'Vérification à revoir'
    }

    await supabase.from('users').update({
      kyc_auto_status: autoStatus, kyc_auto_reason: reason, kyc_checked_at: new Date().toISOString(),
    }).eq('id', user.id)

    // ── Validation automatique ───────────────────────────────────
    if (autoStatus === 'approved') {
      const now = new Date().toISOString()
      if (user.kyc_purpose === 'vendor' && user.role === 'artisan' && user.status === 'pending') {
        await supabase.from('users').update({ status: 'active', vendor_validated_at: now, vendor_reject_reason: null }).eq('id', user.id)
        await supabase.from('shops').update({ status: 'active', updated_at: now }).eq('user_id', user.id)
      } else if (user.kyc_purpose === 'hunter' && user.hunter_status === 'pending_verification') {
        await supabase.from('users').update({ hunter_status: 'verified', hunter_verified_at: now, hunter_reject_reason: null }).eq('id', user.id)
      }
    }

    return json({ success: true, status: autoStatus })
  } catch (err) {
    console.error('didit-webhook error:', err)
    return json({ error: 'Internal error' }, 500)
  }
})
