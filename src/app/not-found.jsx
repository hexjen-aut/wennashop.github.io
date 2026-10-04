import ErrorScreen from '@/components/ErrorScreen';
import styles from '@/components/ErrorScreen.module.css';

export const metadata = { title: 'Page introuvable — WennaShop' };

export default function NotFound() {
  return (
    <ErrorScreen
      code="ERREUR 404"
      title="Oups, cette page s'est perdue en route"
      text="Wenna a cherché partout, mais la page demandée n'existe pas ou a été déplacée. Le produit a peut-être été retiré par son vendeur."
    >
      <a href="/boutique" className={styles.btn}>Retour à la boutique</a>
      <a href="/recherche" className={styles.btnGhost}>Rechercher un produit</a>
    </ErrorScreen>
  );
}
