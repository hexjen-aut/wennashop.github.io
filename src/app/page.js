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

export default function HomePage() {
  return (
    <>
      <HomeSessionRedirect />
      <BoutiqueClient />
    </>
  );
}
