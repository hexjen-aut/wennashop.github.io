'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';
import Nav from '@/components/Nav';
import styles from './boutique-vendeur.module.css';

function fmt(n, c = 'MAD') { try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: c }).format(n); } catch { return `${n} ${c}`; } }

function Content() {
  const params = useSearchParams();
  const slug = params.get('slug');
  const id = params.get('id');
  const vendeur = params.get('vendeur');

  const [shop, setShop] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      const sb = getSupabase();
      let q = sb.from('shops').select('*, users(full_name, city, country)');
      if (slug) q = q.eq('slug', slug);
      else if (id) q = q.eq('id', id);
      else if (vendeur) q = q.eq('user_id', vendeur);
      else { setNotFound(true); setLoading(false); return; }

      const { data } = await q.maybeSingle();
      if (!data) { setNotFound(true); setLoading(false); return; }
      setShop(data);

      const { data: prods } = await sb.from('products').select('id,name,price,currency,image_url,images,country')
        .eq('seller_id', data.user_id).eq('status', 'active').order('created_at', { ascending: false });
      setProducts(prods || []);
      setLoading(false);
    })();
  }, [slug, id, vendeur]);

  if (loading) return <><Nav /><div style={{ padding: 60, textAlign: 'center', color: 'var(--text-faint)' }}>Chargement…</div></>;
  if (notFound) return <><Nav /><div style={{ padding: 60, textAlign: 'center' }}>Cette boutique n'existe pas ou n'est plus disponible.</div></>;

  return (
    <>
      <Nav />
      <div className={styles.banner} style={shop.banner_url ? { backgroundImage: `url(${shop.banner_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}} />
      <div className={styles.header}>
        <div className={styles.logo}>{shop.logo_url ? <img src={shop.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} /> : shop.name.charAt(0).toUpperCase()}</div>
        <div style={{ flex: 1 }}>
          <div className={styles.name}>{shop.name}</div>
          <div className={styles.tags}>
            {shop.is_verified && <span className={styles.tag}>✓ Certifié</span>}
            {shop.country && <span className={styles.tag}>{shop.country}</span>}
            {shop.city && <span className={styles.tag}>{shop.city}</span>}
          </div>
        </div>
      </div>

      <div className={styles.main}>
        {shop.bio && <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 24, maxWidth: 600 }}>{shop.bio}</p>}
        <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 14 }}>Catalogue ({products.length})</h2>
        <div className={styles.grid}>
          {products.map((p) => {
            const img = Array.isArray(p.images) && p.images.length ? p.images[0] : (p.image_url || null);
            return (
              <Link href={`/produit?id=${p.id}`} className={styles.card} key={p.id}>
                <div className={styles.img}>{img && <img src={img} alt={p.name} />}</div>
                <div className={styles.info}>
                  <div className={styles.pname}>{p.name}</div>
                  <div className={styles.price}>{fmt(p.price, p.currency)}</div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}

export default function BoutiqueVendeurPage() {
  return <Suspense fallback={null}><Content /></Suspense>;
}
