import { headers } from 'next/headers';
import { COUNTRIES } from '@/lib/geo';

// Pays du visiteur d'après sa connexion (en-tête ajouté par Vercel) : sert à
// choisir le pays de la boutique à l'ouverture, sans question ni autorisation.
// Rien n'est enregistré ici.
export const dynamic = 'force-dynamic';

const ISO_TO_NAME = {
  MA: 'Maroc', GA: 'Gabon', SN: 'Sénégal', CI: "Côte d'Ivoire", CM: 'Cameroun', CG: 'Congo',
  CD: 'RD Congo', BJ: 'Bénin', TG: 'Togo', ML: 'Mali', BF: 'Burkina Faso', GN: 'Guinée',
  DZ: 'Algérie', TN: 'Tunisie', NE: 'Niger', TD: 'Tchad', MR: 'Mauritanie', MG: 'Madagascar',
  KM: 'Comores', DJ: 'Djibouti', CF: 'Centrafrique',
};

export function GET() {
  const iso = (headers().get('x-vercel-ip-country') || '').toUpperCase();
  const name = ISO_TO_NAME[iso];
  return Response.json(
    { iso: /^[A-Z]{2}$/.test(iso) ? iso : null, country: name && COUNTRIES.includes(name) ? name : null },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
