// src/lib/shipping.js
//
// Transport au poids des quêtes. Le calcul fait foi en base
// (fonction quest_shipping_quote, déclencheurs sur quests / quest_proposals) :
// ici on ne fait qu'afficher et demander un aperçu à la même fonction.

export const SHIPPING_RATES_KEY = 'shipping_rates';

// maxKg null = trop gros pour une estimation automatique (sur devis)
export const SIZE_BRACKETS = [
  { value: 'petit', label: 'Petit', maxKg: 0.5, range: '≤ 0,5 kg', hint: 'bijou, cosmétique, accessoire' },
  { value: 'moyen', label: 'Moyen', maxKg: 2, range: '≤ 2 kg', hint: 'vêtement, chaussures' },
  { value: 'gros', label: 'Gros', maxKg: 5, range: '≤ 5 kg', hint: 'sac, petit électroménager' },
  { value: 'tres_gros', label: 'Très gros', maxKg: null, range: '+ de 5 kg', hint: 'meuble, gros appareil : transport sur devis' },
];

export function bracketFor(value) {
  return SIZE_BRACKETS.find((b) => b.value === value) || null;
}

// Poids retenu pour l'estimation : le MAXIMUM de la tranche × quantité
export function estimatedWeightKg(bracketValue, quantity) {
  const b = bracketFor(bracketValue);
  const q = Number(quantity);
  if (!b || b.maxKg == null || !Number.isFinite(q) || q < 1) return null;
  return Math.round(b.maxKg * q * 100) / 100;
}

export function formatKg(kg) {
  return `${Number(kg).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} kg`;
}

// Aperçu du transport, calculé par la base avec les tarifs de l'admin.
// Retourne un nombre, ou null si aucun tarif ne couvre le trajet.
export async function quoteShipping(sb, { weightKg, origin, destination, currency }) {
  if (!weightKg || !origin || !destination || !currency) return null;
  const { data, error } = await sb.rpc('quest_shipping_quote', {
    p_weight_kg: weightKg, p_origin: origin, p_destination: destination, p_currency: currency,
  });
  if (error) return null;
  return data == null ? null : Number(data);
}

// Tarifs de l'admin : [{ from, to, rate_per_kg, currency, minimum }]
export function parseShippingRates(raw) {
  try {
    const list = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(list)) return [];
    return list
      .filter((r) => r && typeof r === 'object')
      .map((r) => ({
        from: String(r.from || ''),
        to: String(r.to || ''),
        rate_per_kg: Number(r.rate_per_kg) || 0,
        currency: String(r.currency || 'MAD').toUpperCase(),
        minimum: Number(r.minimum) || 0,
      }));
  } catch {
    return [];
  }
}
