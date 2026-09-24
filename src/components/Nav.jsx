'use client';

import Link from 'next/link';
import { useCart } from '@/context/CartContext';
import tourStyles from './TourOverlay.module.css';
import styles from './Nav.module.css';

// `highlightId` : id du bouton à faire ressortir pendant un tuto interactif
// (voir TourOverlay) — 'tour-cart-btn' ou 'tour-suivi-btn' pour l'instant.
export default function Nav({ onOpenCart, highlightId }) {
  const { count } = useCart();
  function hl(id) { return highlightId === id ? tourStyles.tourHighlight : ''; }

  return (
    <nav className={styles.nav}>
      <div className={styles.navInner}>
        <Link href="/boutique" className={styles.logo}>
          <img src="/wenna_icon.png" alt="" className={styles.logoIcon} />
          <span>Wenna</span>Shop
        </Link>
        <div className={styles.navActs}>
          <Link href="/recherche" className={styles.navBtn} aria-label="Rechercher">
            <i className="ph ph-magnifying-glass" />
          </Link>
          <button id="tour-cart-btn" className={`${styles.navBtn} ${hl('tour-cart-btn')}`} onClick={onOpenCart} aria-label="Panier">
            <i className="ph ph-shopping-bag" />
            {count > 0 && <span className={`${styles.cartBadge} ${styles.show}`}>{count > 99 ? '99+' : count}</span>}
          </button>
          <Link href="/suivi" id="tour-suivi-btn" className={`${styles.navBtn} ${hl('tour-suivi-btn')}`} aria-label="Suivi de commande">
            <i className="ph ph-package" />
          </Link>
          <Link href="/compte" className={styles.navBtn} aria-label="Mon compte">
            <i className="ph ph-user-circle" />
          </Link>
        </div>
      </div>
    </nav>
  );
}
