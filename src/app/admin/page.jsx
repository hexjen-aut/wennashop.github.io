'use client';

import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import styles from './admin.module.css';

function fmt(n, c = 'MAD') { try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: c }).format(n); } catch { return `${n} ${c}`; } }

export default function AdminPage() {
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [loginError, setLoginError] = useState('');

  const [section, setSection] = useState('dashboard');
  const [kpis, setKpis] = useState({ revenue: 0, orders: 0, users: 0, products: 0, pending: 0 });
  const [pendingProducts, setPendingProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState([]);

  useEffect(() => { checkAuth(); }, []);

  async function checkAuth() {
    const sb = getSupabase();
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { setChecking(false); return; }
    const { data } = await sb.from('users').select('role').eq('auth_id', session.user.id).single();
    if (data?.role === 'admin') { setAuthorized(true); await loadDashboard(); }
    setChecking(false);
  }

  async function doLogin() {
    setLoginError('');
    const sb = getSupabase();
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pwd });
    if (error) { setLoginError('Email ou mot de passe incorrect.'); return; }
    const { data: u } = await sb.from('users').select('role').eq('auth_id', data.user.id).single();
    if (u?.role !== 'admin') { setLoginError('Accès réservé aux administrateurs.'); await sb.auth.signOut(); return; }
    setAuthorized(true);
    await loadDashboard();
  }

  async function loadDashboard() {
    const sb = getSupabase();
    const [{ count: orderCount }, { count: userCount }, { count: prodCount }, { count: pendCount }, { data: payments }] = await Promise.all([
      sb.from('orders').select('id', { count: 'exact', head: true }),
      sb.from('users').select('id', { count: 'exact', head: true }),
      sb.from('products').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      sb.from('products').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      sb.from('payments').select('amount,status'),
    ]);
    const revenue = (payments || []).filter((p) => p.status === 'paid').reduce((s, p) => s + Number(p.amount || 0), 0);
    setKpis({ revenue, orders: orderCount || 0, users: userCount || 0, products: prodCount || 0, pending: pendCount || 0 });
  }

  async function loadValidation() {
    const sb = getSupabase();
    const { data } = await sb.from('products').select('*, users(full_name,email)').eq('status', 'pending').order('created_at', { ascending: false });
    setPendingProducts(data || []);
  }

  async function loadOrders() {
    const sb = getSupabase();
    const { data } = await sb.from('orders').select('*').order('created_at', { ascending: false }).limit(50);
    setOrders(data || []);
  }

  async function loadUsers() {
    const sb = getSupabase();
    const { data } = await sb.from('users').select('*').order('created_at', { ascending: false }).limit(100);
    setUsers(data || []);
  }

  function goTo(s) {
    setSection(s);
    const sb = getSupabase();
    if (s === 'validation') loadValidation();
    if (s === 'orders') loadOrders();
    if (s === 'users') loadUsers();
  }

  async function approveProduct(id) {
    const sb = getSupabase();
    await sb.from('products').update({ status: 'active' }).eq('id', id);
    await loadValidation();
    await loadDashboard();
  }
  async function rejectProduct(id) {
    if (!confirm('Rejeter ce produit ?')) return;
    const sb = getSupabase();
    await sb.from('products').update({ status: 'inactive' }).eq('id', id);
    await loadValidation();
  }
  async function updateOrderStatus(id, status) {
    const sb = getSupabase();
    await sb.from('orders').update({ status }).eq('id', id);
    await loadOrders();
  }

  if (checking) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-faint)' }}>Vérification…</div>;

  if (!authorized) {
    return (
      <div className={styles.gate}>
        <div className={styles.gateBox}>
          <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 4 }}><span style={{ color: 'var(--accent)' }}>Wenna</span>Shop</div>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 20 }}>Administration — accès réservé</div>
          {loginError && <div style={{ color: 'var(--error)', fontSize: 12, marginBottom: 12 }}>{loginError}</div>}
          <input className={styles.input} type="email" placeholder="email@wennashop.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className={styles.input} type="password" placeholder="Mot de passe" value={pwd} onChange={(e) => setPwd(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doLogin()} />
          <button className={styles.btnPrimary} onClick={doLogin}>Se connecter</button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <aside className={styles.sidebar}>
        <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 16, padding: '0 12px' }}><span style={{ color: 'var(--accent)' }}>Wenna</span>Shop <span style={{ fontSize: 9, color: 'var(--accent)' }}>ADMIN</span></div>
        <button className={`${styles.navItem} ${section === 'dashboard' ? styles.navItemActive : ''}`} onClick={() => goTo('dashboard')}>Dashboard</button>
        <button className={`${styles.navItem} ${section === 'validation' ? styles.navItemActive : ''}`} onClick={() => goTo('validation')}>Validation ({kpis.pending})</button>
        <button className={`${styles.navItem} ${section === 'orders' ? styles.navItemActive : ''}`} onClick={() => goTo('orders')}>Commandes</button>
        <button className={`${styles.navItem} ${section === 'users' ? styles.navItemActive : ''}`} onClick={() => goTo('users')}>Utilisateurs</button>
      </aside>

      <main className={styles.main}>
        {section === 'dashboard' && (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 18 }}>Dashboard</h1>
            <div className={styles.statGrid}>
              <div className={styles.statCard}><div className={styles.statNum} style={{ color: 'var(--accent)' }}>{fmt(kpis.revenue)}</div><div className={styles.statLabel}>Revenus</div></div>
              <div className={styles.statCard}><div className={styles.statNum}>{kpis.orders}</div><div className={styles.statLabel}>Commandes</div></div>
              <div className={styles.statCard}><div className={styles.statNum}>{kpis.users}</div><div className={styles.statLabel}>Utilisateurs</div></div>
              <div className={styles.statCard}><div className={styles.statNum} style={{ color: 'var(--gold)' }}>{kpis.pending}</div><div className={styles.statLabel}>En validation</div></div>
            </div>
          </>
        )}

        {section === 'validation' && (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 18 }}>Produits en validation</h1>
            <div className={styles.card}>
              <table className={styles.table}>
                <thead><tr><th>Produit</th><th>Vendeur</th><th>Prix</th><th>Actions</th></tr></thead>
                <tbody>
                  {pendingProducts.length === 0 ? (
                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: 30, color: 'var(--text-faint)' }}>Aucun produit en attente ✓</td></tr>
                  ) : pendingProducts.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td>{p.users?.full_name || p.users?.email || '—'}</td>
                      <td style={{ color: 'var(--accent)', fontWeight: 700 }}>{fmt(p.price)}</td>
                      <td>
                        <button className={styles.btnSm} onClick={() => approveProduct(p.id)}>✓ Approuver</button>{' '}
                        <button className={styles.btnDanger} onClick={() => rejectProduct(p.id)}>✕ Rejeter</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {section === 'orders' && (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 18 }}>Commandes</h1>
            <div className={styles.card}>
              <table className={styles.table}>
                <thead><tr><th>Réf.</th><th>Montant</th><th>Statut</th></tr></thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td style={{ fontFamily: 'monospace' }}>#{o.id.slice(0, 8).toUpperCase()}</td>
                      <td style={{ color: 'var(--accent)', fontWeight: 700 }}>{fmt(o.total_amount, o.currency)}</td>
                      <td>
                        <select value={o.status} onChange={(e) => updateOrderStatus(o.id, e.target.value)} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '4px 8px', fontSize: 11 }}>
                          {['pending', 'processing', 'shipped', 'delivered', 'cancelled'].map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {section === 'users' && (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 18 }}>Utilisateurs</h1>
            <div className={styles.card}>
              <table className={styles.table}>
                <thead><tr><th>Nom</th><th>Email</th><th>Rôle</th></tr></thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>{u.full_name || '—'}</td>
                      <td>{u.email}</td>
                      <td><span className={styles.badge} style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>{u.role || 'buyer'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
