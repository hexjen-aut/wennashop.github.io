'use client';

// Demande de commande en gros : ouvre (ou rouvre) une discussion avec la
// boutique, puis renvoie vers /gros. Depuis une fiche produit, `product` est
// fixé ; depuis la page boutique, l'acheteur choisit parmi `products`.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
import { hasContactInfo } from '@/lib/wholesale';
import styles from './WholesaleRequestModal.module.css';

const ERRORS = {
  below_min_qty: 'La quantité est en dessous du minimum pour la vente en gros.',
  wholesale_not_available: "Cette boutique n'accepte pas les commandes en gros pour ce produit.",
  shop_not_found: "Cette boutique n'est pas disponible.",
  invalid_message: 'Écris un message (2 000 caractères au plus).',
};

export default function WholesaleRequestModal({ shopId, shopName, product = null, products = [], onClose }) {
  const router = useRouter();
  const [productId, setProductId] = useState(product?.id || '');
  const chosen = product || products.find((p) => p.id === productId) || null;
  const minQty = chosen?.wholesale_min_qty || 10;
  const [qty, setQty] = useState(String(minQty));
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  async function submit() {
    setError('');
    const quantity = chosen ? parseInt(qty, 10) : null;
    if (chosen && !(quantity >= minQty)) { setError(`Minimum ${minQty} unités pour ce produit.`); return; }
    if (!message.trim()) { setError(ERRORS.invalid_message); return; }
    const sb = getSupabase();
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      router.push(`/connexion?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    setSending(true);
    const { data, error: err } = await sb.rpc('open_wholesale_thread', {
      p_shop_id: shopId, p_product_id: chosen?.id || null, p_quantity: quantity, p_message: message.trim(),
    });
    setSending(false);
    if (err) {
      const code = Object.keys(ERRORS).find((k) => err.message?.includes(k));
      setError(code ? ERRORS[code] : "La demande n'a pas pu être envoyée. Réessaie.");
      return;
    }
    router.push(`/gros?t=${data}`);
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.box} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Commander en gros">
        <div className={styles.head}>
          <div>
            <div className={styles.title}>Commander en gros</div>
            <div className={styles.sub}>{shopName}</div>
          </div>
          <button className={styles.close} onClick={onClose} aria-label="Fermer">×</button>
        </div>

        {!product && products.length > 0 && (
          <label className={styles.field}>
            <span className={styles.label}>Produit</span>
            <select className={styles.input} value={productId} onChange={(e) => { setProductId(e.target.value); const p = products.find((x) => x.id === e.target.value); setQty(String(p?.wholesale_min_qty || 10)); }}>
              <option value="">Plusieurs produits / autre demande</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} (dès {p.wholesale_min_qty} unités)</option>)}
            </select>
          </label>
        )}
        {chosen && (
          <label className={styles.field}>
            <span className={styles.label}>Quantité (minimum {minQty})</span>
            <input className={styles.input} type="number" min={minQty} value={qty} onChange={(e) => setQty(e.target.value)} />
          </label>
        )}
        <label className={styles.field}>
          <span className={styles.label}>Ta demande</span>
          <textarea className={styles.input} rows={4} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)}
            placeholder="Versions souhaitées, délai, ville de livraison…" />
        </label>
        {hasContactInfo(message) && <div className={styles.warn}>Les numéros, emails et liens sont masqués automatiquement : tout se passe sur WennaShop.</div>}
        <p className={styles.note}>La boutique te répond dans la discussion et t'envoie un devis. Si tu l'acceptes, tu paies sur WennaShop, comme une commande normale : ton argent est protégé jusqu'à la livraison.</p>
        {error && <div className={styles.error}>{error}</div>}
        <button className={styles.submit} onClick={submit} disabled={sending}>{sending ? 'Envoi…' : 'Envoyer ma demande'}</button>
      </div>
    </div>
  );
}
