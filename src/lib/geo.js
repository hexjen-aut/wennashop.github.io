// Source unique des pays pour toute l'app — doit rester synchronisée avec
// la table Supabase `countries` (project aakxoydznmybstfozjte). Les valeurs
// ci-dessous sont les noms exacts stockés dans `countries.name` : c'est ce
// texte, tel quel, qui doit être écrit dans les colonnes `country` de
// addresses/carriers/products/shops/users, sinon les filtres pays (boutique,
// transporteurs, visibilité produit) ne matchent plus rien.

export const COUNTRIES = [
  'Maroc', 'Gabon', 'Sénégal', "Côte d'Ivoire", 'Cameroun', 'Congo', 'RD Congo',
  'Bénin', 'Togo', 'Mali', 'Burkina Faso', 'Guinée', 'Algérie', 'Tunisie',
  'Niger', 'Tchad', 'Mauritanie', 'Madagascar', 'Comores', 'Djibouti', 'Centrafrique',
];

// Sous-ensemble avec autocollant "Autre" — utilisé dans les formulaires où un
// pays hors liste doit rester sélectionnable (inscription, profil).
export const COUNTRIES_WITH_AUTRE = [...COUNTRIES, 'Autre'];

// Pays où WennaShop a des vendeurs actifs / livre réellement — utilisé pour
// le marché acheteur (boutique) et le "ships_to" vendeur.
export const SHIP_COUNTRIES = ['Gabon', 'Maroc', 'Bénin', 'Sénégal', "Côte d'Ivoire", 'Cameroun', 'Mali'];

export const COUNTRY_FLAG = {
  Maroc: '🇲🇦', Gabon: '🇬🇦', Sénégal: '🇸🇳', "Côte d'Ivoire": '🇨🇮', Cameroun: '🇨🇲',
  Congo: '🇨🇬', 'RD Congo': '🇨🇩', Bénin: '🇧🇯', Togo: '🇹🇬', Mali: '🇲🇱',
  'Burkina Faso': '🇧🇫', Guinée: '🇬🇳', Algérie: '🇩🇿', Tunisie: '🇹🇳', Niger: '🇳🇪',
  Tchad: '🇹🇩', Mauritanie: '🇲🇷', Madagascar: '🇲🇬', Comores: '🇰🇲', Djibouti: '🇩🇯',
  Centrafrique: '🇨🇫',
};

// Regroupement régional pour l'écran d'inscription — mêmes valeurs que
// COUNTRIES, juste organisées par zone pour l'UX du <select>.
export const PAYS_GROUPS = [
  { label: 'Maghreb', options: ['Maroc', 'Algérie', 'Tunisie'] },
  { label: 'Afrique Centrale', options: ['Gabon', 'Cameroun', 'Congo', 'RD Congo', 'Centrafrique', 'Tchad'] },
  { label: "Afrique de l'Ouest", options: ['Sénégal', "Côte d'Ivoire", 'Mali', 'Burkina Faso', 'Guinée', 'Bénin', 'Togo', 'Niger', 'Mauritanie'] },
  { label: "Afrique de l'Est & Océan Indien", options: ['Madagascar', 'Djibouti', 'Comores'] },
  { label: 'Autre', options: ['Autre'] },
];
