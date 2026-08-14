'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';
import Nav from '@/components/Nav';
import styles from '@/app/boutique/boutique.module.css';

function fmt(n, c = 'MAD') { try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: c, minimumFractionDigits: 0 }).format(n); } catch { return `${n} ${c}`; } }

export default function RecherchePage() {
  const [term, setTerm] = useState('');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!term.trim()) { setProducts([]); return; }
      setLoading(true);
      const sb = getSupabase();
      const { data } = await sb.from('products')
        .select('id,name,price,currency,country,image_url,images')
        .eq('status', 'active').ilike('name', `%${term}%`).limit(48);
      setProducts(data || []);
      setLoading(false);
    }, 350);
    return () => clearTimeout(t);
  }, [term]);

  return (
    <>
      <Nav />
      <section className={styles.pageHero}>
        <div className={styles.pageEyebrow}>Trouver un produit</div>
        <h1 className={styles.pageTitle}>Explorer</h1>
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Rechercher un produit…"
          style={{ marginTop: 16, width: '100%', maxWidth: 420, background: 'var(--surface-2)', border: '1.5px solid var(--border)', borderRadius: 999, color: 'var(--text)', padding: '12px 18px', fontSize: 14, outline: 'none' }}
        />
      </section>

      <div className={styles.productsArea}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-faint)' }}>Recherche…</div>
        ) : !term.trim() ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-faint)' }}>Tape un mot-clé pour lancer la recherche.</div>
        ) : products.length === 0 ? (
          <div className={styles.noResults}><div className={styles.noResultsTitle}>Aucun résultat</div></div>
        ) : (
          <div className={styles.prodGrid}>
            {products.map((p) => {
              const img = Array.isArray(p.images) && p.images.length ? p.images[0] : (p.image_url || 'https://images.unsplash.com/photo-1608181831688-e6c2cd67f0a9?w=400&q=80');
              return (
                <Link href={`/produit?id=${p.id}`} className={styles.prodCard} key={p.id}>
                  <div className={styles.prodImg}><img src={img} alt={p.name} loading="lazy" /></div>
                  <div className={styles.prodInfo}>
                    <div className={styles.prodName}>{p.name}</div>
                    <div className={styles.prodPrice}>{fmt(p.price, p.currency)}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
