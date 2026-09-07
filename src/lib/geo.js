// Source unique des pays WennaShop — miroir de la table Supabase `countries`.
// Toute page qui affiche ou enregistre un pays doit venir d'ici, pas d'une liste locale.
export const COUNTRIES = [
  { code: 'MA', name: 'Maroc', currency: 'MAD', phonePrefix: '+212', flag: '🇲🇦', region: 'Maghreb' },
  { code: 'GA', name: 'Gabon', currency: 'XAF', phonePrefix: '+241', flag: '🇬🇦', region: 'Afrique Centrale' },
  { code: 'SN', name: 'Sénégal', currency: 'XOF', phonePrefix: '+221', flag: '🇸🇳', region: "Afrique de l'Ouest" },
  { code: 'CI', name: "Côte d'Ivoire", currency: 'XOF', phonePrefix: '+225', flag: '🇨🇮', region: "Afrique de l'Ouest" },
  { code: 'CM', name: 'Cameroun', currency: 'XAF', phonePrefix: '+237', flag: '🇨🇲', region: 'Afrique Centrale' },
  { code: 'CG', name: 'Congo', currency: 'XAF', phonePrefix: '+242', flag: '🇨🇬', region: 'Afrique Centrale' },
  { code: 'CD', name: 'RD Congo', currency: 'CDF', phonePrefix: '+243', flag: '🇨🇩', region: 'Afrique Centrale' },
  { code: 'BJ', name: 'Bénin', currency: 'XOF', phonePrefix: '+229', flag: '🇧🇯', region: "Afrique de l'Ouest" },
  { code: 'TG', name: 'Togo', currency: 'XOF', phonePrefix: '+228', flag: '🇹🇬', region: "Afrique de l'Ouest" },
  { code: 'ML', name: 'Mali', currency: 'XOF', phonePrefix: '+223', flag: '🇲🇱', region: "Afrique de l'Ouest" },
  { code: 'BF', name: 'Burkina Faso', currency: 'XOF', phonePrefix: '+226', flag: '🇧🇫', region: "Afrique de l'Ouest" },
  { code: 'GN', name: 'Guinée', currency: 'GNF', phonePrefix: '+224', flag: '🇬🇳', region: "Afrique de l'Ouest" },
  { code: 'DZ', name: 'Algérie', currency: 'DZD', phonePrefix: '+213', flag: '🇩🇿', region: 'Maghreb' },
  { code: 'TN', name: 'Tunisie', currency: 'TND', phonePrefix: '+216', flag: '🇹🇳', region: 'Maghreb' },
  { code: 'NE', name: 'Niger', currency: 'XOF', phonePrefix: '+227', flag: '🇳🇪', region: "Afrique de l'Ouest" },
  { code: 'TD', name: 'Tchad', currency: 'XAF', phonePrefix: '+235', flag: '🇹🇩', region: 'Afrique Centrale' },
  { code: 'MR', name: 'Mauritanie', currency: 'MRU', phonePrefix: '+222', flag: '🇲🇷', region: "Afrique de l'Ouest" },
  { code: 'MG', name: 'Madagascar', currency: 'MGA', phonePrefix: '+261', flag: '🇲🇬', region: "Afrique de l'Est & Océan Indien" },
  { code: 'KM', name: 'Comores', currency: 'KMF', phonePrefix: '+269', flag: '🇰🇲', region: "Afrique de l'Est & Océan Indien" },
  { code: 'DJ', name: 'Djibouti', currency: 'DJF', phonePrefix: '+253', flag: '🇩🇯', region: "Afrique de l'Est & Océan Indien" },
  { code: 'CF', name: 'Centrafrique', currency: 'XAF', phonePrefix: '+236', flag: '🇨🇫', region: 'Afrique Centrale' },
];

// Valeur de repli quand le pays du visiteur n'est dans aucune liste ci-dessus.
export const OTHER_COUNTRY = 'Autre';

// Liste plate de noms, pour les <select> et filtres simples (ex: boutique, vendeur).
export const COUNTRY_NAMES = [...COUNTRIES.map((c) => c.name), OTHER_COUNTRY];

// Regroupement par région, pour les <select> avec <optgroup> (ex: connexion).
export const COUNTRY_GROUPS = [
  'Maghreb',
  'Afrique Centrale',
  "Afrique de l'Ouest",
  "Afrique de l'Est & Océan Indien",
].map((region) => ({
  label: region,
  options: COUNTRIES.filter((c) => c.region === region).map((c) => ({ v: c.name, l: c.name })),
})).concat([{ label: 'Autre', options: [{ v: OTHER_COUNTRY, l: 'Autre pays' }] }]);

export function isKnownCountry(name) {
  return COUNTRY_NAMES.includes(name);
}
