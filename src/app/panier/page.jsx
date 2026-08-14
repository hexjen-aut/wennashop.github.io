'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useCart } from '@/context/CartContext';
import Nav from '@/components/Nav';
import CartSidebar from '@/components/CartSidebar';
import styles from './panier.module.css';

function formatPrice(amount, currency = 'MAD') {
  try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(amount); }
  catch { return `${amount} ${currency}`; }
}

export default function PanierPage() {
  const { items, subtotal, updateQuantity, remove, loading } = useCart();
  const [cartOpen, setCartOpen] = useState(false);
  const currency = items[0]?.currency || 'MAD';

  return (
    <>
      <Nav onOpenCart={() => setCartOpen(true)} />
      <CartSidebar open={cartOpen} onClose={() => setCartOpen(false)} />

      <div className={styles.wrap}>
        <h1 className={styles.title}>Mon panier</h1>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-faint)' }}>Chargement…</div>
        ) : items.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyTitle}>Ton panier est vide</div>
            <Link href="/boutique" className={styles.btnPrimary}>Explorer la boutique</Link>
          </div>
        ) : (
          <div className={styles.layout}>
            <div className={styles.itemsCol}>
              {items.map((item) => (
                <div className={styles.row} key={item.cart_item_id}>
                  {item.image ? <img src={item.image} alt={item.name} className={styles.img} /> : <div className={styles.img} />}
                  <div className={styles.info}>
                    <div className={styles.name}>{item.name}</div>
                    <div className={styles.price}>{formatPrice(item.price, item.currency)}</div>
                    <div className={styles.qtyRow}>
                      <button className={styles.qtyBtn} onClick={() => updateQuantity(item.cart_item_id, item.quantity - 1)}>−</button>
                      <span>{item.quantity}</span>
                      <button className={styles.qtyBtn} onClick={() => updateQuantity(item.cart_item_id, item.quantity + 1)}>+</button>
                      <button className={styles.removeBtn} onClick={() => remove(item.cart_item_id)}>Retirer</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className={styles.summaryCol}>
              <div className={styles.totalRow}>
                <span>Total</span>
                <span style={{ color: 'var(--accent)' }}>{formatPrice(subtotal, currency)}</span>
              </div>
              <Link href="/paiement" className={styles.checkoutBtn}>
                <i className="ph ph-lock-simple" /> Passer au paiement
              </Link>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
