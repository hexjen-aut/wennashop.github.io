'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';
import { useCart } from '@/context/CartContext';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import CartSidebar from '@/components/CartSidebar';
import { convertPrice, formatSmartPrice } from '@/lib/currency';
import { getBuyerCurrency } from '@/lib/buyerCurrency';
import styles from './produit.module.css';
import { mediaUrl } from '@/lib/mediaUrl';

export default function ProduitContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const { add, clear } = useCart();

  const [product, setProduct] = useState(null);
  const [displayPrice, setDisplayPrice] = useState('');
  const [displayComparePrice, setDisplayComparePrice] = useState('');
  const [seller, setSeller] = useState(null);
  const [shop, setShop] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [activeImg, setActiveImg] = useState(0);
  // Variantes (coloris, taille) : le prix et le stock suivent la taille choisie.
  const [variants, setVariants] = useState([]);
  const [variantPrices, setVariantPrices] = useState({}); // prix vendeur → prix affiché
  const [pickColor, setPickColor] = useState(null);
  const [pickSize, setPickSize] = useState(null);
  const [pickError, setPickError] = useState(false);

  const [rating, setRating] = useState(0);
  const [reviewName, setReviewName] = useState('');
  const [reviewText, setReviewText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setActiveImg(0);
    setVariants([]); setPickColor(null); setPickSize(null); setPickError(false);
    if (!id) { setNotFound(true); setLoading(false); return; }
    (async () => {
      const sb = getSupabase();
      const { data } = await sb.from('products').select('*, categories(name)').eq('id', id).single();
      if (!data) { setNotFound(true); setLoading(false); return; }
      const { data: imgs } = await sb.from('product_images').select('url,position').eq('product_id', id).order('position');
      data._images = imgs || [];
      setProduct(data);

      const buyerCurrency = getBuyerCurrency();
      const { data: vars } = await sb.from('product_variants')
        .select('id,color,size,price,stock,image_url,sort_order')
        .eq('product_id', id).eq('is_active', true).order('sort_order');
      if (vars?.length) {
        const prices = [...new Set(vars.map((v) => Number(v.price ?? data.price)))];
        const labels = {};
        for (const pr of prices) {
          const c = await convertPrice(pr, data.currency || 'MAD', buyerCurrency, sb);
          labels[pr] = formatSmartPrice(c.amount, c.currency);
        }
        setVariantPrices(labels);
        setVariants(vars);
      }
      const conv = await convertPrice(data.price, data.currency || 'MAD', buyerCurrency, sb);
      setDisplayPrice(formatSmartPrice(conv.amount, conv.currency));
      if (data.compare_price > data.price) {
        const convCompare = await convertPrice(data.compare_price, data.currency || 'MAD', buyerCurrency, sb);
        setDisplayComparePrice(formatSmartPrice(convCompare.amount, convCompare.currency));
      }

      if (data.seller_id) {
        const [{ data: user }, { data: shopRow }] = await Promise.all([
          sb.from('vendors_public').select('id,full_name,avatar_url,created_at,country').eq('id', data.seller_id).maybeSingle(),
          sb.from('shops').select('id,slug,name,logo_url,rating_avg,rating_count,total_sales,is_verified,is_official,founder_rank').eq('user_id', data.seller_id).maybeSingle(),
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
    if (p._images && p._images.length) return p._images.map((i) => mediaUrl(i.url || i));
    if (Array.isArray(p.images) && p.images.length) return p.images.map((u) => mediaUrl(u));
    if (p.image_url) return [mediaUrl(p.image_url)];
    return [];
  }

  const colors = [...new Set(variants.map((v) => v.color).filter(Boolean))];
  const sizes = [...new Set(variants.map((v) => v.size).filter(Boolean))];
  const variantFor = (color, size) => variants.find((v) => (v.color || null) === (colors.length ? color : null) && (v.size || null) === (sizes.length ? size : null));
  const selectedVariant = variants.length ? variantFor(pickColor, pickSize) : null;
  const priceOf = (v) => Number(v?.price ?? product?.price);
  const priceValues = [...new Set(variants.map(priceOf))].sort((a, b) => a - b);

  function chooseColor(c) {
    setPickColor(c); setPickError(false);
    // La photo suit le coloris choisi.
    const v = variants.find((x) => x.color === c && x.image_url);
    if (v) {
      const i = images.findIndex((src) => src.endsWith(v.image_url));
      if (i >= 0) setActiveImg(i);
    }
  }

  async function handleAddToCart() {
    if (!product) return;
    if (variants.length && !selectedVariant) {
      setPickError(true);
      document.getElementById('variant-picker')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (selectedVariant && selectedVariant.stock != null && selectedVariant.stock < 1) return;
    const res = await add(product, 1, selectedVariant);
    if (!res.success && res.error === 'different_shop') {
      if (!confirm('Ton panier contient déjà des produits d\'une autre boutique. Le vider pour ajouter celui-ci ?')) return;
      await clear();
      await add(product, 1, selectedVariant);
    }
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
  const details = [
    ['Marque', product.brand], ['Matière', product.material], ['Couleur', product.color],
    ['Poids', product.weight], ['Dimensions', product.dimensions],
    ...Object.entries(product.characteristics || {}),
  ].filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '');
  const metaParts = [];
  if (shop?.is_official) metaParts.push('Boutique officielle WennaShop');
  else if (shop?.is_verified) metaParts.push('✓ Certifié');
  if (shop?.founder_rank) metaParts.push('Vendeur fondateur');
  if (seller?.country) metaParts.push(seller.country);

  return (
    <>
      <Nav onOpenCart={() => setCartOpen(true)} />
      <CartSidebar open={cartOpen} onClose={() => setCartOpen(false)} />

      <main className={styles.pageWrap}>
        <div className={styles.gallery}>
          <div className={styles.mainImgWrap}>
            {images[0] && <img src={images[activeImg] || images[0]} alt={product.name} />}
            {product.country && <div className={styles.originBadge}>Produit du {product.country}</div>}
          </div>
          {images.length > 1 && (
            <div className={styles.thumbs}>
              {images.map((src, i) => (
                <button
                  type="button"
                  key={src + i}
                  className={`${styles.thumb} ${i === activeImg ? styles.thumbActive : ''}`}
                  onClick={() => setActiveImg(i)}
                  aria-label={`Photo ${i + 1} sur ${images.length}`}
                  aria-current={i === activeImg}
                >
                  <img src={src} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={styles.content}>
          <div className={styles.eyebrow}>{product.categories?.name || product.category || ''}</div>
          <h1 className={styles.title}>{product.name}</h1>
          <div className={styles.priceRow}>
            <div className={styles.price}>
              {selectedVariant
                ? variantPrices[priceOf(selectedVariant)] || displayPrice
                : priceValues.length > 1 ? `À partir de ${variantPrices[priceValues[0]] || displayPrice}` : displayPrice}
            </div>
            {product.compare_price > product.price && (
              <div className={styles.comparePrice}>{displayComparePrice}</div>
            )}
          </div>

          {variants.length > 0 && (
            <div id="variant-picker" className={`${styles.picker} ${pickError ? styles.pickerError : ''}`}>
              {colors.length > 0 && (
                <div className={styles.pickGroup}>
                  <div className={styles.pickLabel}>Coloris{pickColor ? ` : ${pickColor}` : ''}</div>
                  <div className={styles.pickOptions}>
                    {colors.map((c) => (
                      <button type="button" key={c} className={`${styles.pickOpt} ${pickColor === c ? styles.pickOptActive : ''}`} onClick={() => chooseColor(c)} aria-pressed={pickColor === c}>{c}</button>
                    ))}
                  </div>
                </div>
              )}
              {sizes.length > 0 && (
                <div className={styles.pickGroup}>
                  <div className={styles.pickLabel}>Taille{pickSize ? ` : ${pickSize}` : ''}</div>
                  <div className={styles.pickOptions}>
                    {sizes.map((z) => {
                      const v = variantFor(colors.length ? pickColor : null, z) || (!pickColor ? variants.find((x) => x.size === z) : null);
                      const out = pickColor && (!v || (v.stock != null && v.stock < 1));
                      return (
                        <button type="button" key={z} disabled={out} className={`${styles.pickOpt} ${pickSize === z ? styles.pickOptActive : ''}`} onClick={() => { setPickSize(z); setPickError(false); }} aria-pressed={pickSize === z}>
                          {z}
                          {priceValues.length > 1 && v && <span className={styles.pickPrice}>{variantPrices[priceOf(v)]}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {pickError && <div className={styles.pickHint}>Choisis {colors.length && !pickColor ? 'un coloris' : ''}{colors.length && !pickColor && sizes.length && !pickSize ? ' et ' : ''}{sizes.length && !pickSize ? 'une taille' : ''} pour ajouter au panier.</div>}
            </div>
          )}

          <div className={styles.chips}>
            {product.country && <div className={styles.chip}><i className="ph ph-map-pin" /><span>Origine : {product.origin_city ? `${product.origin_city}, ` : ''}{product.country}</span></div>}
            {selectedVariant
              ? <div className={styles.chip}><i className="ph ph-cube" /><span>{selectedVariant.stock == null || selectedVariant.stock > 0 ? `${selectedVariant.stock ?? ''} en stock`.trim() : 'Rupture de stock'}</span></div>
              : product.stock !== undefined && <div className={styles.chip}><i className="ph ph-cube" /><span>{product.stock > 0 ? `${product.stock} en stock` : 'Rupture de stock'}</span></div>}
          </div>

          <div className={styles.sectionTitle}>À propos de ce produit</div>
          <p className={styles.description}>{product.description || 'Aucune description disponible.'}</p>

          {details.length > 0 && (
            <>
              <div className={styles.sectionTitle}>Détails</div>
              <dl className={styles.details}>
                {details.map(([k, v]) => (
                  <div className={styles.detailRow} key={k}><dt>{k}</dt><dd>{String(v)}</dd></div>
                ))}
              </dl>
            </>
          )}

          <div className={styles.divider} />

          <div className={styles.sectionTitle}>Vendeur</div>
          <div className={styles.sellerCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className={styles.sellerAv}>
                {shop?.logo_url ? <img src={mediaUrl(shop.logo_url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (shop?.name || seller?.full_name || 'V').charAt(0).toUpperCase()}
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
            <span>
              La livraison est gérée directement par le vendeur.
              {product.delivery_days ? ` Délai estimé : ${product.delivery_days} jour${product.delivery_days > 1 ? 's' : ''}.` : ' Contactez-le pour les délais et tarifs.'}
            </span>
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

      <Footer />

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
