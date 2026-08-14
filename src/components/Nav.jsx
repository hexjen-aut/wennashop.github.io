'use client';

import Link from 'next/link';
import { useCart } from '@/context/CartContext';
import styles from './Nav.module.css';

export default function Nav({ onOpenCart }) {
  const { count } = useCart();

  return (
    <nav className={styles.nav}>
      <div className={styles.navInner}>
        <Link href="/boutique" className={styles.logo}><span>Wenna</span>Shop</Link>
        <div className={styles.navActs}>
          <Link href="/recherche" className={styles.navBtn} aria-label="Rechercher">
            <i className="ph ph-magnifying-glass" />
          </Link>
          <button className={styles.navBtn} onClick={onOpenCart} aria-label="Panier">
            <i className="ph ph-shopping-bag" />
            {count > 0 && <span className={`${styles.cartBadge} ${styles.show}`}>{count > 99 ? '99+' : count}</span>}
          </button>
          <Link href="/suivi" className={styles.navBtn} aria-label="Suivi de commande">
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
