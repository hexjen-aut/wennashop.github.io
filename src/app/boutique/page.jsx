import BoutiqueClient from './BoutiqueClient';

export const metadata = {
  title: 'La Boutique',
  description: 'Parcourez des produits authentiques vendus par des vendeurs vérifiés au Gabon et au Maroc, livraison gérée directement par le vendeur.',
  alternates: { canonical: 'https://wennashop.com/boutique' },
};

export default function BoutiquePage() {
  return <BoutiqueClient />;
}
