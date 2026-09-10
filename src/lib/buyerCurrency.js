import { currencyForCountry } from './currency';

// Même clé que celle utilisée par le sélecteur de pays sur /boutique — lire
// cette valeur ici permet à la devise d'affichage de suivre automatiquement
// le pays choisi par l'acheteur, sur toutes les pages du site.
export const BUYER_COUNTRY_KEY = 'wenna_buyer_country';

export function getBuyerCurrency() {
  if (typeof window === 'undefined') return 'MAD';
  try {
    const country = localStorage.getItem(BUYER_COUNTRY_KEY);
    return currencyForCountry(country) || 'MAD';
  } catch {
    return 'MAD';
  }
}
