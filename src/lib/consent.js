// Consentement aux cookies et traceurs non indispensables.
// Le stockage nécessaire (connexion, panier, pays, visites guidées) n'en
// dépend pas. Seule la mesure d'audience (Vercel Analytics) attend l'accord.
// Le choix est gardé dans le navigateur ; on redemande au bout de 6 mois ou
// quand CONSENT_VERSION change (nouveau traceur à déclarer).

export const CONSENT_KEY = 'wenna_consent';
export const CONSENT_VERSION = 1;
export const CONSENT_EVENT = 'wenna-consent-change';
export const CONSENT_OPEN_EVENT = 'wenna-consent-open';
const MAX_AGE_MS = 182 * 24 * 60 * 60 * 1000;

export function readConsent() {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (c?.v !== CONSENT_VERSION || !c.at) return null;
    if (Date.now() - new Date(c.at).getTime() > MAX_AGE_MS) return null;
    return c;
  } catch {
    return null;
  }
}

export function saveConsent({ analytics }) {
  const c = { v: CONSENT_VERSION, analytics: !!analytics, at: new Date().toISOString() };
  try { localStorage.setItem(CONSENT_KEY, JSON.stringify(c)); } catch {}
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: c }));
  return c;
}

export function hasAnalyticsConsent() {
  return readConsent()?.analytics === true;
}

// Rouvre le bandeau (lien « Gérer les cookies »).
export function openConsentSettings() {
  window.dispatchEvent(new Event(CONSENT_OPEN_EVENT));
}
