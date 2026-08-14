'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';
import { useCart } from '@/context/CartContext';
import Nav from '@/components/Nav';
import CartSidebar from '@/components/CartSidebar';
import styles from './produit.module.css';

function formatPrice(amount, currency = 'MAD') {
  try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(amount); }
  catch { return `${amount} ${currency}`; }
}

function ProduitContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const { add } = useCart();

  const [product, setProduct] = useState(null);
  const [seller, setSeller] = useState(null);
  const [shop, setShop] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  const [rating, setRating] = useState(0);
  const [reviewName, setReviewName] = useState('');
  const [reviewText, setReviewText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!id) { setNotFound(true); setLoading(false); return; }
    (async () => {
      const sb = getSupabase();
      const { data } = await sb.from('products').select('*, categories(name)').eq('id', id).single();
      if (!data) { setNotFound(true); setLoading(false); return; }
      const { data: imgs } = await sb.from('product_images').select('url,position').eq('product_id', id).order('position');
      data._images = imgs || [];
      setProduct(data);

      if (data.seller_id) {
        const [{ data: user }, { data: shopRow }] = await Promise.all([
          sb.from('users').select('id,full_name,avatar_url,created_at,country').eq('id', data.seller_id).single(),
          sb.from('shops').select('id,slug,name,logo_url,rating_avg,rating_count,total_sales,is_verified').eq('user_id', data.seller_id).maybeSingle(),
        ]);
        setSeller(user || null);
        setShop(shopRow || null);
      }

      const { data: revs } = await sb.from('reviews').select('*').eq('product_id', id).eq('status', 'approved').order('created_at', { ascending: false });
      setReviews(revs || []);
      setLoading(false);
    })();
  }, [id]);

  function getImages(p) {
    if (!p) return [];
    if (p._images && p._images.length) return p._images.map((i) => i.url || i);
    if (Array.isArray(p.images) && p.images.length) return p.images;
    if (p.image_url) return [p.image_url];
    return [];
  }

  async function handleAddToCart() {
    if (!product) return;
    await add(product, 1);
    setCartOpen(true);
  }

  async function submitReview() {
    if (!rating) { alert('Sélectionne une note'); return; }
    if (!reviewText.trim()) { alert('Écris ton avis'); return; }
    setSending(true);
    const sb = getSupabase();
    const { error } = await sb.from('reviews').insert({
      product_id: id, reviewer_name: reviewName || 'Anonyme', rating, comment: reviewText, status: 'pending',
    });
    setSending(false);
    if (error) { alert('Erreur lors de l\'envoi'); return; }
    setRating(0); setReviewName(''); setReviewText('');
    alert('Avis envoyé — en attente de validation');
  }

  if (loading) return (
    <>
      <Nav onOpenCart={() => setCartOpen(true)} />
      <div className={styles.pageWrap}><div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)' }}>Chargement…</div></div>
    </>
  );

  if (notFound) return (
    <>
      <Nav onOpenCart={() => setCartOpen(true)} />
      <div className={styles.pageWrap}>
        <div style={{ padding: 60, textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Produit introuvable</div>
          <Link href="/boutique" style={{ color: 'var(--accent)' }}>Retour à la boutique</Link>
        </div>
      </div>
    </>
  );

  const images = getImages(product);
  const metaParts = [];
  if (shop?.is_verified) metaParts.push('✓ Certifié');
  if (seller?.country) metaParts.push(seller.country);

  return (
    <>
      <Nav onOpenCart={() => setCartOpen(true)} />
      <CartSidebar open={cartOpen} onClose={() => setCartOpen(false)} />

      <main className={styles.pageWrap}>
        <div className={styles.gallery}>
          <div className={styles.mainImgWrap}>
            {images[0] && <img src={images[0]} alt={product.name} />}
            {product.country && <div className={styles.originBadge}>Produit du {product.country}</div>}
          </div>
        </div>

        <div className={styles.content}>
          <div className={styles.eyebrow}>{product.categories?.name || product.category || ''}</div>
          <h1 className={styles.title}>{product.name}</h1>
          <div className={styles.priceRow}>
            <div className={styles.price}>{formatPrice(product.price, product.currency || 'MAD')}</div>
            {product.compare_price > product.price && (
              <div className={styles.comparePrice}>{formatPrice(product.compare_price, product.currency || 'MAD')}</div>
            )}
          </div>

          <div className={styles.chips}>
            {product.country && <div className={styles.chip}><i className="ph ph-map-pin" /><span>Origine : {product.origin_city ? `${product.origin_city}, ` : ''}{product.country}</span></div>}
            {product.stock !== undefined && <div className={styles.chip}><i className="ph ph-cube" /><span>{product.stock > 0 ? `${product.stock} en stock` : 'Rupture de stock'}</span></div>}
          </div>

          <div className={styles.sectionTitle}>À propos de ce produit</div>
          <p className={styles.description}>{product.description || 'Aucune description disponible.'}</p>

          <div className={styles.divider} />

          <div className={styles.sectionTitle}>Vendeur</div>
          <div className={styles.sellerCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className={styles.sellerAv}>
                {shop?.logo_url ? <img src={shop.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (shop?.name || seller?.full_name || 'V').charAt(0).toUpperCase()}
              </div>
              <div>
                <div className={styles.sellerName}>{shop?.name || seller?.full_name || 'Vendeur'}</div>
                <div className={styles.sellerMeta}>{metaParts.join(' · ')}</div>
              </div>
            </div>
            {shop?.slug && (
              <Link href={`/boutique-vendeur?slug=${shop.slug}`} className={styles.btnSeller}>
                <i className="ph ph-storefront" /> Voir la boutique
              </Link>
            )}
          </div>

          <div className={styles.deliveryInfo}>
            <i className="ph ph-truck" />
            <span>La livraison est gérée directement par le vendeur. Contactez-le pour les délais et tarifs.</span>
          </div>

          <div className={styles.divider} />
          <div className={styles.sectionTitle}>Avis clients</div>

          <div className={styles.reviewFormCard}>
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 14 }}>Laisser un avis</div>
            <div className={styles.starSelect}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} className={`${styles.starBtn} ${n <= rating ? styles.active : ''}`} onClick={() => setRating(n)}>★</button>
              ))}
            </div>
            <input className={styles.reviewNameInput} placeholder="Votre prénom (ou pseudo)" value={reviewName} onChange={(e) => setReviewName(e.target.value)} maxLength={50} />
            <textarea className={styles.reviewInput} placeholder="Partagez votre expérience avec ce produit…" value={reviewText} onChange={(e) => setReviewText(e.target.value)} maxLength={500} />
            <button className={styles.btnSubmitReview} onClick={submitReview} disabled={sending}>
              <i className="ph ph-paper-plane-tilt" /> {sending ? 'Envoi…' : "Soumettre l'avis"}
            </button>
          </div>

          {reviews.length === 0 ? (
            <div className={styles.noReviews}>Sois le premier à donner ton avis !</div>
          ) : reviews.map((r) => (
            <div className={styles.reviewCard} key={r.id}>
              <div className={styles.reviewHeader}>
                <div>
                  <div className={styles.reviewer}>{r.reviewer_name || 'Acheteur anonyme'}</div>
                  <div className={styles.stars}>{'★'.repeat(Math.round(r.rating || 0))}{'☆'.repeat(5 - Math.round(r.rating || 0))}</div>
                </div>
                <div className={styles.reviewDate}>{r.created_at ? new Date(r.created_at).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long' }) : ''}</div>
              </div>
              <div className={styles.reviewText}>{r.comment}</div>
            </div>
          ))}
        </div>
      </main>

      <div className={styles.bottomBar}>
        <div className={styles.bottomBarInner}>
          <button className={styles.btnCart} onClick={handleAddToCart}>
            <i className="ph ph-shopping-bag-open" /> Ajouter au panier
          </button>
        </div>
      </div>
    </>
  );
}

export default function ProduitPage() {
  return (
    <Suspense fallback={null}>
      <ProduitContent />
    </Suspense>
  );
}
