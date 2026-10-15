import BoutiqueClient from './boutique/BoutiqueClient';
import HomeSessionRedirect from './HomeSessionRedirect';

// Accueil public : le catalogue de la boutique, servi directement en « / »
// (réponse 200, sans redirection) pour être indexable. Un visiteur déjà
// connecté garde son parcours habituel (HomeSessionRedirect).
export const metadata = {
  title: { absolute: 'WennaShop — Marketplace Gabon ↔ Maroc' },
  description: 'Achetez et vendez entre le Gabon et le Maroc : produits authentiques de vendeurs vérifiés, paiement par mobile money ou virement, argent gardé par WennaShop jusqu’à la livraison.',
  alternates: { canonical: 'https://wennashop.com/' },
};

// Nom du site dans les résultats Google (au lieu de « wennashop.com ») :
// Google le lit sur la page d'accueil uniquement.
const STRUCTURED_DATA = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'WennaShop',
    alternateName: ['Wenna Shop', 'WennaShop Gabon Maroc'],
    url: 'https://wennashop.com/',
  },
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'WennaShop',
    url: 'https://wennashop.com/',
    logo: 'https://wennashop.com/icon-512.png',
  },
];

export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }} />
      <HomeSessionRedirect />
      <BoutiqueClient />
    </>
  );
}
