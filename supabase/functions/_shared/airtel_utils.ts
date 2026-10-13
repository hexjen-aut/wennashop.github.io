// Fonctions pures Airtel Money (sans accès réseau ni base) : testables seules.

// Numéro Airtel Gabon → format attendu par l'API (sans indicatif pays).
// Accepte +241, 00241, 241, espaces, tirets et le 0 initial. Par défaut le 0
// est retiré (77xxxxxx) ; keepZero = true le garde (077xxxxxx), selon ce
// qu'exige le compte Airtel (variable AIRTEL_MSISDN_KEEP_ZERO).
export function normalizeMsisdn(input: string, keepZero = false): string | null {
  let d = String(input ?? '').replace(/[^\d]/g, '')
  if (d.startsWith('00241')) d = d.slice(5)
  else if (d.startsWith('241') && d.length > 9) d = d.slice(3)
  const local = d.replace(/^0/, '')
  if (!/^7\d{7}$/.test(local)) return null
  return keepZero ? `0${local}` : local
}

// « Jean Dupont » → « J*** D*** » (affiché avant de confirmer le paiement)
export function maskName(first?: string | null, last?: string | null): string {
  const mask = (s?: string | null) => {
    const t = String(s ?? '').trim()
    return t ? `${t[0].toUpperCase()}***` : ''
  }
  return [mask(first), mask(last)].filter(Boolean).join(' ')
}

// Référence de transaction unique : WN + horodatage base 36 + aléa, 20 caractères max
export function makeReference(now = Date.now(), rand = Math.random): string {
  const r = Array.from({ length: 6 }, () => '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(rand() * 36)]).join('')
  return `WN${now.toString(36).toUpperCase()}${r}`.slice(0, 20)
}

// Statut de transaction Airtel → statut du site
//   TS succès · TF échec · TE expiré · TA ambigu · TIP en cours
export function mapTransactionStatus(code?: string | null): 'paid' | 'failed' | 'pending' {
  const c = String(code ?? '').toUpperCase()
  if (c === 'TS') return 'paid'
  if (c === 'TF' || c === 'TE') return 'failed'
  return 'pending'
}

// Message clair pour l'acheteur à partir du code / message Airtel
export function friendlyMessage(code?: string | null, message?: string | null): string {
  const c = String(code ?? '').toUpperCase()
  const m = String(message ?? '').toLowerCase()
  if (c === 'DP00800001007' || /insufficient|not enough|solde/.test(m)) return 'Solde Airtel Money insuffisant.'
  if (c === 'DP00800001002' || /pin/.test(m)) return 'Code PIN incorrect. Réessaie le paiement.'
  if (c === 'TE' || c === 'DP00800001024' || c === 'DP00800001029' || /timed? ?out|expired|expir/.test(m)) return 'Délai dépassé : le paiement n\'a pas été validé à temps sur le téléphone.'
  if (c === 'DP00800001008' || /refus|declin|cancel/.test(m)) return 'Paiement refusé sur le téléphone.'
  if (c === 'DP00800001003') return 'Montant supérieur à la limite autorisée sur ce compte Airtel Money.'
  if (/not (an )?airtel|invalid msisdn|subscriber not found|user not found/.test(m)) return 'Ce numéro n\'est pas un compte Airtel Money.'
  return 'Le paiement Airtel Money n\'a pas abouti.'
}
