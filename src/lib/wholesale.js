// Commandes en gros : aides partagées entre la fiche, la boutique et /gros.

// Même détection que wholesale_mask_contacts (base de données), qui fait foi :
// ici, elle sert seulement à prévenir avant l'envoi.
const CONTACT_PATTERNS = [
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
  /(https?:\/\/|www\.)\S+|\b(wa\.me|t\.me|chat\.whatsapp\.com|whatsapp\.com|instagram\.com|facebook\.com|fb\.me|m\.me)\S*/i,
  /\+?\d([\s.()/-]*\d){7,}/,
];

export function hasContactInfo(text) {
  return CONTACT_PATTERNS.some((re) => re.test(text || ''));
}

export function currencyName(cur) {
  return cur === 'XAF' || cur === 'FCFA' ? 'FCFA' : cur || 'MAD';
}

export function formatMoney(amount, cur) {
  return `${Number(amount || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${currencyName(cur)}`;
}

export const QUOTE_STATUS = {
  proposed: 'En attente de ta réponse',
  declined: 'Refusé',
  cancelled: 'Remplacé ou annulé',
  ordered: 'Accepté : commande créée',
};
