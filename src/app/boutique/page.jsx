'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';
import { useCart } from '@/context/CartContext';
import Nav from '@/components/Nav';
import CartSidebar from '@/components/CartSidebar';
import styles from './boutique.module.css';

const PAGE_SIZE = 24;

function formatPrice(amount, currency = 'MAD') {
  try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency, minimumFractionDigits: 0 }).format(amount); }
  catch { return `${Number(amount).toFixed(0)} ${currency}`; }
}

export default function BoutiquePage() {
  const { add } = useCart();
  const [cartOpen, setCartOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  const [catId, setCatId] = useState('');
  const [sort, setSort] = useState('created_at:desc');
  const [page, setPage] = useState(1);
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Charger les catégories une seule fois
  useEffect(() => {
    (async () => {
      const sb = getSupabase();
      const { data } = await sb.from('categories').select('id,name').eq('is_active', true).order('sort_order', { ascending: true }).limit(12);
      setCategories(data || []);
    })();
  }, []);

  // Charger les produits à chaque changement de filtre / page / tri
  useEffect(() => {
    (async () => {
      setLoading(true);
      const sb = getSupabase();
      const [col, dir] = sort.split(':');
      const offset = (page - 1) * PAGE_SIZE;
      let q = sb.from('products')
        .select('id,name,price,currency,country,origin_city,stock,images,image_url,category_id,categories(name)', { count: 'exact' })
        .eq('status', 'active')
        .range(offset, offset + PAGE_SIZE - 1)
        .order(col, { ascending: dir === 'asc' });
      if (catId) q = q.eq('category_id', catId);
      const { data, count } = await q;
      setProducts(data || []);
      setTotal(count || 0);
      setLoading(false);
    })();
  }, [catId, sort, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function handleAdd(e, product) {
    e.preventDefault();
    e.stopPropagation();
    await add(product, 1);
    setCartOpen(true);
  }

  return (
    <>
      <Nav onOpenCart={() => setCartOpen(true)} />
      <CartSidebar open={cartOpen} onClose={() => setCartOpen(false)} />

      <section className={styles.pageHero}>
        <div className={styles.pageEyebrow}>Marketplace inter-africaine</div>
        <h1 className={styles.pageTitle}>La <span>Boutique</span></h1>
        <p className={styles.pageSub}>
          Produits et vendeurs vérifiés, livraison gérée par le vendeur.{' '}
          {total > 0 && <span style={{ color: 'var(--accent)', fontWeight: 800 }}>{total} produit{total > 1 ? 's' : ''}</span>}
        </p>
      </section>

      <div className={styles.toolbar}>
        <div className={styles.catsScroll}>
          <button className={`${styles.catBtn} ${!catId ? styles.catBtnActive : ''}`} onClick={() => { setCatId(''); setPage(1); }}>Tout</button>
          {categories.map((c) => (
            <button key={c.id} className={`${styles.catBtn} ${catId === String(c.id) ? styles.catBtnActive : ''}`}
              onClick={() => { setCatId(String(c.id)); setPage(1); }}>{c.name}</button>
          ))}
        </div>
        <div className={styles.toolbarRight}>
          <span className={styles.resultsCount}>{total > 0 ? `${total} produit${total > 1 ? 's' : ''}` : ''}</span>
          <select className={styles.sortSelect} value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
            <option value="created_at:desc">Plus récents</option>
            <option value="price:asc">Prix ↑</option>
            <option value="price:desc">Prix ↓</option>
            <option value="name:asc">A → Z</option>
          </select>
        </div>
      </div>

      <div className={styles.productsArea}>
        {loading ? (
          <div className={styles.prodGrid}>
            {Array.from({ length: 12 }).map((_, i) => (
              <div className={styles.prodCard} key={i}>
                <div className={`${styles.prodImg} ${styles.skel}`} />
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className={styles.noResults}>
            <div className={styles.noResultsTitle}>Aucun produit trouvé</div>
            <div className={styles.noResultsSub}>Essayez une autre catégorie.</div>
          </div>
        ) : (
          <div className={styles.prodGrid}>
            {products.map((p) => {
              const img = Array.isArray(p.images) && p.images.length ? p.images[0] : (p.image_url || 'https://images.unsplash.com/photo-1608181831688-e6c2cd67f0a9?w=400&q=80');
              const paysLabel = (p.country || '').toLowerCase().includes('maroc') ? 'MA' : 'GA';
              return (
                <Link href={`/produit?id=${p.id}`} className={styles.prodCard} key={p.id}>
                  <div className={styles.prodImg}>
                    <img src={img} alt={p.name} loading="lazy" />
                    <span className={styles.prodBadge}>{paysLabel}</span>
                    <button className={styles.prodAdd} onClick={(e) => handleAdd(e, p)} aria-label="Ajouter au panier">
                      <i className="ph ph-plus" style={{ fontSize: 14 }} />
                    </button>
                  </div>
                  <div className={styles.prodInfo}>
                    <div className={styles.prodCat}>{p.categories?.name || ''}{p.origin_city ? ` · ${p.origin_city}` : ''}</div>
                    <div className={styles.prodName}>{p.name}</div>
                    <div className={styles.prodFt}>
                      <div className={styles.prodPrice}>{formatPrice(p.price, p.currency)}</div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className={styles.pagination}>
            <button className={styles.pageBtn} disabled={page === 1} onClick={() => setPage(page - 1)}>‹</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((i) => i === 1 || i === totalPages || Math.abs(i - page) <= 1)
              .map((i, idx, arr) => (
                <span key={i} style={{ display: 'flex' }}>
                  {idx > 0 && arr[idx - 1] !== i - 1 && <span style={{ display: 'flex', alignItems: 'center', color: 'var(--text-faint)', padding: '0 4px' }}>…</span>}
                  <button className={`${styles.pageBtn} ${i === page ? styles.pageBtnActive : ''}`} onClick={() => setPage(i)}>{i}</button>
                </span>
              ))}
            <button className={styles.pageBtn} disabled={page === totalPages} onClick={() => setPage(page + 1)}>›</button>
          </div>
        )}
      </div>
    </>
  );
}
