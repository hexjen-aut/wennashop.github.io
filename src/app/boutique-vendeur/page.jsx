'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';
import { useCart } from '@/context/CartContext';
import Nav from '@/components/Nav';
import styles from './boutique-vendeur.module.css';

function fmt(n, c = 'MAD') {
  try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(n); }
  catch { return `${n} ${c}`; }
}
function initials(name) {
  if (!name) return 'W';
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}
function starsText(n) {
  const full = Math.round(n || 0);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

function Content() {
  const params = useSearchParams();
  const slug = params.get('slug');
  const id = params.get('id');
  const vendeur = params.get('vendeur');
  const { add } = useCart();

  const [shop, setShop] = useState(null);
  const [products, setProducts] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [following, setFollowing] = useState(false);
  const [toast, setToast] = useState(null);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  useEffect(() => {
    (async () => {
      const sb = getSupabase();
      let q = sb.from('shops').select('*, users(full_name, specialty, city, country, created_at)');
      if (slug) q = q.eq('slug', slug);
      else if (id) q = q.eq('id', id);
      else if (vendeur) q = q.eq('user_id', vendeur);
      else { setNotFound(true); setLoading(false); return; }

      const { data } = await q.eq('status', 'active').maybeSingle();
      if (!data) { setNotFound(true); setLoading(false); return; }
      setShop(data);

      const { data: prods } = await sb
        .from('products')
        .select('id,name,price,currency,image_url,images,country,compare_price,stock,created_at,categories(name)')
        .eq('seller_id', data.user_id)
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      setProducts(prods || []);

      const { data: revs } = await sb
        .from('reviews')
        .select('id,rating,comment,reviewer_name,created_at,products!inner(seller_id)')
        .eq('products.seller_id', data.user_id)
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(6);
      setReviews(revs || []);

      setLoading(false);
    })();
  }, [slug, id, vendeur]);

  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.categories?.name).filter(Boolean));
    return [...set];
  }, [products]);

  const filtered = useMemo(() => {
    let list = [...products];
    if (category !== 'all') list = list.filter((p) => p.categories?.name === category);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    if (sort === 'price_asc') list.sort((a, b) => a.price - b.price);
    else if (sort === 'price_desc') list.sort((a, b) => b.price - a.price);
    else if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    else list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return list;
  }, [products, category, search, sort]);

  async function handleAdd(e, p) {
    e.preventDefault();
    e.stopPropagation();
    await add({ id: p.id, name: p.name, price: p.price, currency: p.currency, image_url: p.image_url });
    showToast(`"${p.name}" ajouté au panier`);
  }

  if (loading) return <><Nav /><div style={{ padding: 60, textAlign: 'center', color: 'var(--text-faint)' }}>Chargement…</div></>;
  if (notFound) {
    return (
      <>
        <Nav />
        <div style={{ padding: 60, textAlign: 'center' }}>
          <p style={{ fontSize: 15, fontWeight: 700 }}>Boutique introuvable</p>
          <p style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 6 }}>Cette boutique n'existe pas ou n'est plus disponible.</p>
        </div>
      </>
    );
  }

  const memberSince = shop.users?.created_at
    ? new Date(shop.users.created_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    : (shop.created_at ? new Date(shop.created_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : null);

  return (
    <>
      <Nav />

      {/* BANNIÈRE */}
      <div className={styles.banner}>
        {shop.banner_url ? <img src={shop.banner_url} alt="" className={styles.bannerImg} /> : <div className={styles.bannerPlaceholder} />}
      </div>

      {/* EN-TÊTE BOUTIQUE */}
      <div className={styles.header}>
        <div className={styles.logo}>
          {shop.logo_url ? <img src={shop.logo_url} alt={shop.name} /> : initials(shop.name)}
        </div>
        <div className={styles.info}>
          <div className={styles.name}>{shop.name}</div>
          <div className={styles.tags}>
            {shop.is_verified && <span className={`${styles.tag} ${styles.tagVerified}`}>Boutique vérifiée</span>}
            {shop.country && <span className={styles.tag}>{shop.country}</span>}
            {shop.city && <span className={styles.tag}>{shop.city}</span>}
          </div>
          <div className={styles.stats}>
            <div className={styles.stat}><span className={styles.statVal}>{shop.total_sales || 0}</span><span className={styles.statLabel}>Ventes</span></div>
            <div className={styles.stat}><span className={styles.statVal}>{shop.rating_avg ? shop.rating_avg.toFixed(1) : '—'}</span><span className={styles.statLabel}>Note</span></div>
            <div className={styles.stat}><span className={styles.statVal}>{shop.rating_count || 0}</span><span className={styles.statLabel}>Avis</span></div>
          </div>
        </div>
        <div className={styles.actions}>
          {shop.whatsapp && (
            <a className={styles.btnContact} href={`https://wa.me/${shop.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">Contacter</a>
          )}
          <button className={`${styles.btnFollow} ${following ? styles.btnFollowActive : ''}`} onClick={() => { setFollowing((v) => !v); showToast(following ? 'Retiré des favoris' : 'Ajouté aux favoris'); }}>
            {following ? 'Suivi' : 'Suivre'}
          </button>
          <div className={styles.socials}>
            {shop.instagram && <a className={styles.socialBtn} href={`https://instagram.com/${shop.instagram.replace('@', '')}`} target="_blank" rel="noreferrer">Instagram</a>}
            {shop.facebook && <a className={styles.socialBtn} href={shop.facebook} target="_blank" rel="noreferrer">Facebook</a>}
            {shop.tiktok && <a className={styles.socialBtn} href={`https://tiktok.com/@${shop.tiktok}`} target="_blank" rel="noreferrer">TikTok</a>}
          </div>
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.main}>
        {/* SIDEBAR */}
        <aside className={styles.sidebar}>
          {shop.bio && (
            <div className={styles.sideCard}>
              <div className={styles.sideTitle}>À propos</div>
              <p className={styles.bio}>{shop.bio}</p>
            </div>
          )}
          <div className={styles.sideCard}>
            <div className={styles.sideTitle}>Informations</div>
            {shop.users?.specialty && <div className={styles.infoRow}>Spécialité<strong>{shop.users.specialty}</strong></div>}
            {memberSince && <div className={styles.infoRow}>Membre depuis<strong>{memberSince}</strong></div>}
            {shop.shop_policies && <div className={styles.infoRow}>Politique<strong>{shop.shop_policies}</strong></div>}
            {!shop.users?.specialty && !memberSince && !shop.shop_policies && <div className={styles.infoRow}><strong>Artisan WennaShop</strong></div>}
          </div>
          {Array.isArray(shop.ships_to) && shop.ships_to.length > 0 && (
            <div className={styles.sideCard}>
              <div className={styles.sideTitle}>Expédie vers</div>
              <div className={styles.shipsList}>
                {shop.ships_to.map((c) => <span key={c} className={styles.shipTag}>{c}</span>)}
              </div>
            </div>
          )}
          {shop.rating_count > 0 && (
            <div className={styles.sideCard}>
              <div className={styles.sideTitle}>Évaluations</div>
              <div className={styles.ratingRow}>
                <span className={styles.stars}>{starsText(shop.rating_avg)}</span>
                <span className={styles.ratingVal}>{(shop.rating_avg || 0).toFixed(1)}</span>
              </div>
              <span className={styles.ratingCount}>{shop.rating_count} avis</span>
            </div>
          )}
        </aside>

        {/* CATALOGUE */}
        <section>
          <div className={styles.catTop}>
            <div>
              <h2 className={styles.catTitle}>Catalogue</h2>
              <span className={styles.catCount}>{filtered.length} produit{filtered.length > 1 ? 's' : ''}</span>
            </div>
          </div>

          {categories.length > 0 && (
            <div className={styles.filters}>
              <button className={`${styles.filterBtn} ${category === 'all' ? styles.filterBtnActive : ''}`} onClick={() => setCategory('all')}>Tout</button>
              {categories.map((c) => (
                <button key={c} className={`${styles.filterBtn} ${category === c ? styles.filterBtnActive : ''}`} onClick={() => setCategory(c)}>{c}</button>
              ))}
            </div>
          )}

          <div className={styles.searchRow}>
            <input className={styles.searchInput} placeholder="Rechercher un produit…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className={styles.sortSelect} value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="newest">Plus récents</option>
              <option value="price_asc">Prix croissant</option>
              <option value="price_desc">Prix décroissant</option>
              <option value="name">Nom A-Z</option>
            </select>
          </div>

          <div className={styles.grid}>
            {filtered.length === 0 ? (
              <div className={styles.empty}>Aucun produit disponible</div>
            ) : filtered.map((p) => {
              const img = Array.isArray(p.images) && p.images.length ? p.images[0] : p.image_url;
              const isNew = Date.now() - new Date(p.created_at).getTime() < 1000 * 60 * 60 * 24 * 7;
              const hasPromo = p.compare_price && p.compare_price > p.price;
              const lowStock = p.stock > 0 && p.stock <= 3;
              return (
                <Link href={`/produit?id=${p.id}`} className={styles.card} key={p.id}>
                  <div className={styles.img}>
                    {img && <img src={img} alt={p.name} />}
                    {hasPromo ? (
                      <span className={`${styles.badge} ${styles.badgePromo}`}>-{Math.round((1 - p.price / p.compare_price) * 100)}%</span>
                    ) : isNew ? (
                      <span className={`${styles.badge} ${styles.badgeNew}`}>Nouveau</span>
                    ) : lowStock ? (
                      <span className={`${styles.badge} ${styles.badgeLow}`}>{p.stock} restant{p.stock > 1 ? 's' : ''}</span>
                    ) : null}
                  </div>
                  <div className={styles.info2}>
                    <div className={styles.pname}>{p.name}</div>
                    <div className={styles.priceRow}>
                      <span className={styles.price}>{fmt(p.price, p.currency)}</span>
                      {hasPromo && <span className={styles.comparePrice}>{fmt(p.compare_price, p.currency)}</span>}
                    </div>
                    <div className={styles.meta}>
                      <span>{p.country || ''}</span>
                      <button className={styles.btnAdd} onClick={(e) => handleAdd(e, p)}>+ Panier</button>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {reviews.length > 0 && (
            <div className={styles.reviewsSection}>
              <div className={styles.divider} style={{ margin: '32px 0 20px' }} />
              <h2 className={styles.catTitle} style={{ marginBottom: 14 }}>Avis clients</h2>
              {reviews.map((r) => (
                <div key={r.id} className={styles.reviewCard}>
                  <div className={styles.reviewHead}>
                    <div className={styles.reviewAv}>{(r.reviewer_name || 'A')[0].toUpperCase()}</div>
                    <div>
                      <div className={styles.reviewName}>{r.reviewer_name || 'Acheteur anonyme'}</div>
                      <div className={styles.reviewStars}>{starsText(r.rating)}</div>
                    </div>
                    <span className={styles.reviewDate}>{new Date(r.created_at).toLocaleDateString('fr-FR')}</span>
                  </div>
                  {r.comment && <p className={styles.reviewText}>{r.comment}</p>}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
    </>
  );
}

export default function BoutiqueVendeurPage() {
  return <Suspense fallback={null}><Content /></Suspense>;
}
