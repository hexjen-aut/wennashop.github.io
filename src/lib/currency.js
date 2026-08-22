// src/lib/currency.js
//
// Système de conversion des prix entre devises, avec une marge de sécurité
// TOUJOURS active pour ne jamais faire perdre d'argent au vendeur si le
// taux de change bouge entre le moment où le prix est affiché et le moment
// où l'argent est réellement transféré.
//
// Fonctionnement :
// - Chaque produit a un prix dans la devise du vendeur (ex: MAD).
// - Quand un visiteur d'un autre pays regarde ce produit, on convertit
//   son prix dans la devise du visiteur (ex: FCFA).
// - À cette conversion, on ajoute une marge de sécurité (4% par défaut).
//   Si le taux change un peu avant que l'argent arrive au vendeur, cette
//   marge absorbe la différence — le vendeur ne perd jamais.
// - Les taux sont stockés dans Supabase (table exchange_rates) pour être
//   mis à jour facilement depuis l'admin. Si jamais cette table est vide
//   ou injoignable, des taux de secours + la marge par défaut prennent le
//   relais automatiquement : la protection ne s'arrête jamais.

const DEFAULT_SAFETY_MARGIN = 0.04; // 4% — appliqué dans tous les cas

// Taux de secours (utilisés seulement si Supabase est injoignable)
const FALLBACK_RATES = {
  MAD_XOF: 65,
  MAD_XAF: 65,
  XOF_MAD: 1 / 65,
  XAF_MAD: 1 / 65,
  MAD_TND: 0.31,
  TND_MAD: 3.2,
};

let ratesCache = null;
let ratesCacheAt = 0;
const CACHE_TTL_MS = 15 * 60 * 1000; // on relit la base toutes les 15 min max

// Détermine la devise normale d'un pays
export function currencyForCountry(country) {
  if (!country) return null;
  const c = country.toLowerCase();
  if (c.includes('maroc')) return 'MAD';
  if (c.includes('tunisie')) return 'TND';
  if (c.includes('madagascar')) return 'MGA';
  if (c.includes('rdc')) return 'CDF';
  if (c.includes('gabon') || c.includes('cameroun') || (c.includes('congo') && !c.includes('rdc'))) return 'XAF';
  if (
    c.includes('benin') || c.includes('bénin') || c.includes('senegal') || c.includes('sénégal') ||
    c.includes('cote d') || c.includes("côte d") || c.includes('mali') || c.includes('burkina') ||
    c.includes('togo') || c.includes('niger')
  ) return 'XOF';
  return null;
}

async function loadRates(sb) {
  const now = Date.now();
  if (ratesCache && now - ratesCacheAt < CACHE_TTL_MS) return ratesCache;
  try {
    const { data, error } = await sb.from('exchange_rates').select('*');
    if (error || !data || !data.length) throw new Error('no rates');
    const map = {};
    data.forEach((r) => {
      map[`${r.base_currency}_${r.quote_currency}`] = {
        rate: r.rate,
        margin: r.safety_margin_percent / 100,
      };
    });
    ratesCache = map;
    ratesCacheAt = now;
    return map;
  } catch {
    return null; // on bascule sur les taux de secours
  }
}

/**
 * Convertit un montant de la devise du vendeur vers la devise du visiteur,
 * marge de sécurité anti-perte incluse automatiquement.
 * Retourne { amount, currency, converted, margin }.
 */
export async function convertPrice(amount, fromCurrency, toCurrency, sb) {
  if (!fromCurrency || !toCurrency || fromCurrency === toCurrency) {
    return { amount, currency: fromCurrency || toCurrency, converted: false, margin: 0 };
  }
  const key = `${fromCurrency}_${toCurrency}`;
  const rates = sb ? await loadRates(sb) : null;
  const entry = rates?.[key];
  const rate = entry?.rate ?? FALLBACK_RATES[key];
  const margin = entry?.margin ?? DEFAULT_SAFETY_MARGIN;

  if (!rate) {
    // Pas de taux connu pour cette paire : on affiche dans la devise
    // d'origine plutôt que de risquer un mauvais calcul.
    return { amount, currency: fromCurrency, converted: false, margin: 0 };
  }
  const raw = amount * rate;
  const protectedAmount = raw * (1 + margin); // protection toujours appliquée
  return { amount: Math.ceil(protectedAmount), currency: toCurrency, converted: true, margin };
}

// Formatage cohérent avec le reste du site (FCFA pour XOF/XAF, sinon devise ISO)
export function formatSmartPrice(amount, currency) {
  if (currency === 'XAF' || currency === 'XOF' || currency === 'FCFA') {
    return `${Number(amount).toLocaleString('fr-FR')} FCFA`;
  }
  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${Number(amount).toFixed(0)} ${currency}`;
  }
}
