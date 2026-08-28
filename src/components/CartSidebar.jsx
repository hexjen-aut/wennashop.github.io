'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import styles from './CartSidebar.module.css';

function formatPrice(amount, currency = 'MAD') {
  try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(amount); }
  catch { return `${amount} ${currency}`; }
}

export default function CartSidebar({ open, onClose }) {
  const { items, count, subtotal, updateQuantity, remove, createOrder } = useCart();
  const [checkingOut, setCheckingOut] = useState(false);
  const router = useRouter();
  const currency = items[0]?.currency || 'MAD';

  async function handleCheckout() {
    setCheckingOut(true);
    const res = await createOrder();
    setCheckingOut(false);
    if (!res.success) {
      if (res.error === 'not_authenticated') { router.push('/connexion'); return; }
      if (res.error === 'out_of_stock') { alert(`Stock insuffisant pour "${res.product}".`); return; }
      alert("Impossible de créer la commande. Réessaie.");
      return;
    }
    onClose?.();
    router.push(`/paiement?order_id=${res.orderId}`);
  }

  return (
    <>
      <div className={`${styles.overlay} ${open ? styles.open : ''}`} onClick={onClose} />
      <aside className={`${styles.sidebar} ${open ? styles.open : ''}`} aria-label="Panier">
        <div className={styles.head}>
          <div className={styles.title}>
            <i className="ph ph-shopping-bag" /> Mon panier
            <span className={styles.count}>{count}</span>
          </div>
          <button className={styles.close} onClick={onClose} aria-label="Fermer"><i className="ph ph-x" /></button>
        </div>

        <div className={styles.body}>
          {items.length === 0 ? (
            <div className={styles.empty}>
              <i className="ph ph-shopping-bag-open" />
              <div className={styles.emptyTitle}>Panier vide</div>
              <div className={styles.emptySub}>Ajoute des produits pour commencer.</div>
            </div>
          ) : items.map((item) => (
            <div className={styles.item} key={item.cart_item_id}>
              <div className={styles.itemImg}>
                {item.image ? <img src={item.image} alt={item.name} /> : <div className={styles.noImg}><i className="ph ph-image" /></div>}
              </div>
              <div className={styles.itemInfo}>
                <div className={styles.itemName} title={item.name}>{item.name}</div>
                <div className={styles.itemPrice}>{formatPrice(item.price * item.quantity, item.currency)}</div>
                <div className={styles.itemActions}>
                  <button className={styles.qtyBtn} onClick={() => updateQuantity(item.cart_item_id, item.quantity - 1)} aria-label="Diminuer"><i className="ph ph-minus" /></button>
                  <span className={styles.qty}>{item.quantity}</span>
                  <button className={styles.qtyBtn} onClick={() => updateQuantity(item.cart_item_id, item.quantity + 1)} aria-label="Augmenter"><i className="ph ph-plus" /></button>
                  <button className={styles.remove} onClick={() => remove(item.cart_item_id)} aria-label="Retirer"><i className="ph ph-trash" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {items.length > 0 && (
          <div className={styles.footer}>
            <div className={styles.summaryRow}><span>Sous-total</span><span>{formatPrice(subtotal, currency)}</span></div>
            <div className={styles.summaryRow} style={{ fontSize: 11, color: 'var(--text-faint)' }}>Livraison calculée à la commande</div>
            <div className={styles.totalRow}><span>Total</span><span className={styles.totalAmount}>{formatPrice(subtotal, currency)}</span></div>
            <button onClick={handleCheckout} disabled={checkingOut} className={styles.checkout}><i className="ph ph-lock-simple" style={{ fontSize: 16 }} /> {checkingOut ? 'Création…' : 'Commander'}</button>
            <Link href="/panier" className={styles.viewCart}>Voir le panier complet</Link>
          </div>
        )}
      </aside>
    </>
  );
}
