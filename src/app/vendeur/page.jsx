'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
import styles from './vendeur.module.css';

function fmt(n, c = 'MAD') { try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: c }).format(n); } catch { return `${n} ${c}`; } }

const STATUS_LABEL = { pending: 'En attente', active: 'Actif', inactive: 'Inactif', processing: 'En traitement', shipped: 'Expédiée', delivered: 'Livrée', cancelled: 'Annulée' };
const STATUS_COLOR = { pending: '#f59e0b', active: '#22c55e', inactive: '#555', processing: '#3b82f6', shipped: '#3b82f6', delivered: '#22c55e', cancelled: '#ef4444' };

export default function VendeurPage() {
  const router = useRouter();
  const [seller, setSeller] = useState(null);
  const [section, setSection] = useState('overview');
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState({ products: 0, orders: 0, revenue: 0 });
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', price: '', stock: '', country: 'Maroc', description: '' });

  useEffect(() => {
    (async () => {
      const sb = getSupabase();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { router.push('/connexion'); return; }
      const { data: user } = await sb.from('users').select('*').eq('auth_id', session.user.id).single();
      if (!user || (user.role !== 'artisan' && user.role !== 'admin')) { router.push('/compte'); return; }
      setSeller(user);
      await loadAll(sb, user.id);
      setLoading(false);
    })();
  }, [router]);

  async function loadAll(sb, sellerId) {
    const { data: prods } = await sb.from('products').select('id,name,price,stock,status,image_url').eq('seller_id', sellerId).order('created_at', { ascending: false });
    setProducts(prods || []);

    const ids = (prods || []).map((p) => p.id);
    let ordersList = [];
    if (ids.length) {
      const { data: items } = await sb.from('order_items').select('order_id').in('product_id', ids);
      const orderIds = [...new Set((items || []).map((i) => i.order_id))];
      if (orderIds.length) {
        const { data: o } = await sb.from('orders').select('id,total_amount,status,created_at').in('id', orderIds).order('created_at', { ascending: false });
        ordersList = o || [];
      }
    }
    setOrders(ordersList);
    setStats({
      products: (prods || []).filter((p) => p.status === 'active').length,
      orders: ordersList.length,
      revenue: ordersList.filter((o) => o.status === 'delivered').reduce((s, o) => s + Number(o.total_amount), 0),
    });
  }

  async function saveProduct() {
    if (!form.name || !form.price) { alert('Nom et prix requis'); return; }
    const sb = getSupabase();
    const { error } = await sb.from('products').insert({
      name: form.name, price: parseFloat(form.price), stock: parseInt(form.stock) || 0,
      country: form.country, description: form.description || null, status: 'pending', seller_id: seller.id,
    });
    if (error) { alert('Erreur : ' + error.message); return; }
    setModalOpen(false);
    setForm({ name: '', price: '', stock: '', country: 'Maroc', description: '' });
    await loadAll(sb, seller.id);
  }

  async function updateOrderStatus(orderId, status) {
    const sb = getSupabase();
    await sb.from('orders').update({ status }).eq('id', orderId);
    await loadAll(sb, seller.id);
  }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-faint)' }}>Chargement…</div>;

  return (
    <div className={styles.wrap}>
      <aside className={styles.sidebar}>
        <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 20, padding: '0 12px' }}><span style={{ color: 'var(--accent)' }}>Wenna</span>Shop</div>
        <button className={`${styles.navItem} ${section === 'overview' ? styles.navItemActive : ''}`} onClick={() => setSection('overview')}>Vue d'ensemble</button>
        <button className={`${styles.navItem} ${section === 'products' ? styles.navItemActive : ''}`} onClick={() => setSection('products')}>Mes produits</button>
        <button className={`${styles.navItem} ${section === 'orders' ? styles.navItemActive : ''}`} onClick={() => setSection('orders')}>Commandes</button>
      </aside>

      <main className={styles.main}>
        {section === 'overview' && (
          <>
            <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 20 }}>Vue d'ensemble</h1>
            <div className={styles.statGrid}>
              <div className={styles.statCard}><div className={styles.statNum} style={{ color: 'var(--accent)' }}>{stats.products}</div><div className={styles.statLabel}>Produits actifs</div></div>
              <div className={styles.statCard}><div className={styles.statNum}>{stats.orders}</div><div className={styles.statLabel}>Commandes</div></div>
              <div className={styles.statCard}><div className={styles.statNum} style={{ color: 'var(--gold)' }}>{fmt(stats.revenue)}</div><div className={styles.statLabel}>Revenus livrés</div></div>
              <div className={styles.statCard}><div className={styles.statNum} style={{ color: 'var(--success)' }}>8%</div><div className={styles.statLabel}>Commission</div></div>
            </div>
          </>
        )}

        {section === 'products' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h1 style={{ fontSize: 24, fontWeight: 900 }}>Mes produits</h1>
              <button className={styles.btnPrimary} onClick={() => setModalOpen(true)}>+ Nouveau</button>
            </div>
            <div className={styles.card}>
              <table className={styles.table}>
                <thead><tr><th>Produit</th><th>Prix</th><th>Stock</th><th>Statut</th></tr></thead>
                <tbody>
                  {products.length === 0 ? (
                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: 30, color: 'var(--text-faint)' }}>Aucun produit</td></tr>
                  ) : products.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td style={{ color: 'var(--accent)', fontWeight: 700 }}>{fmt(p.price)}</td>
                      <td>{p.stock}</td>
                      <td><span className={styles.badge} style={{ background: `${STATUS_COLOR[p.status]}22`, color: STATUS_COLOR[p.status] }}>{STATUS_LABEL[p.status] || p.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {section === 'orders' && (
          <>
            <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 16 }}>Commandes</h1>
            <div className={styles.card}>
              <table className={styles.table}>
                <thead><tr><th>Réf.</th><th>Montant</th><th>Statut</th><th>Action</th></tr></thead>
                <tbody>
                  {orders.length === 0 ? (
                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: 30, color: 'var(--text-faint)' }}>Aucune commande</td></tr>
                  ) : orders.map((o) => (
                    <tr key={o.id}>
                      <td style={{ fontFamily: 'monospace' }}>#{o.id.slice(0, 8).toUpperCase()}</td>
                      <td style={{ color: 'var(--accent)', fontWeight: 700 }}>{fmt(o.total_amount)}</td>
                      <td><span className={styles.badge} style={{ background: `${STATUS_COLOR[o.status]}22`, color: STATUS_COLOR[o.status] }}>{STATUS_LABEL[o.status] || o.status}</span></td>
                      <td>
                        <select className={styles.input} style={{ padding: '4px 8px', fontSize: 11 }} value={o.status} onChange={(e) => updateOrderStatus(o.id, e.target.value)}>
                          {['pending', 'processing', 'shipped', 'delivered', 'cancelled'].map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>

      {modalOpen && (
        <div className={styles.modalOv} onClick={() => setModalOpen(false)}>
          <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}>Nouveau produit</div>
            <div className={styles.modalBody}>
              <input className={styles.input} placeholder="Nom du produit *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <textarea className={styles.input} placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <input className={styles.input} type="number" placeholder="Prix (MAD) *" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
                <input className={styles.input} type="number" placeholder="Stock" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
              </div>
              <select className={styles.input} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}>
                <option value="Maroc">🇲🇦 Maroc</option>
                <option value="Gabon">🇬🇦 Gabon</option>
              </select>
              <button className={styles.btnPrimary} onClick={saveProduct}>Créer le produit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
