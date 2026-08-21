'use client';

import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import styles from './admin.module.css';

function fmt(n, c = 'MAD') { try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: c }).format(n); } catch { return `${n} ${c}`; } }
function fdate(d) { return d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'; }
function flag(c) { const m = { Gabon: '🇬🇦', Maroc: '🇲🇦', Morocco: '🇲🇦', France: '🇫🇷' }; return `${m[c] || '🌍'} ${c || '—'}`; }
function stars(r) { return r ? '★'.repeat(Math.round(r)) + '☆'.repeat(5 - Math.round(r)) : '—'; }

const ORDER_STATUS_LABEL = { pending: 'En attente', processing: 'En cours', shipped: 'Expédié', delivered: 'Livré', cancelled: 'Annulé' };
const STATUS_COLOR = { pending: '#f59e0b', active: '#22c55e', inactive: '#555', processing: '#3b82f6', shipped: '#3b82f6', delivered: '#22c55e', cancelled: '#ef4444', approved: '#22c55e', rejected: '#ef4444', paid: '#22c55e', failed: '#ef4444' };
const ICONS = ['🛍️','👗','👠','👜','👒','🧣','🧢','💍','📿','🛒','🍽️','🫙','🌿','🫚','🧴','🪴','🎨','🪵','🏺','🧺','🧶','🪡','✂️','🔨','🪚','🧲','💎','🌍','🇬🇦','🇲🇦','🎁','📦','🏠','🚗','📱','💻','🎵','📚','⚽','🌺','🌾','☕','🍵','🥘','🧁','🍊','🥭','🌴','🐘','🦁','🦅','🎭','🎪','🏆','⭐','✨','🔥','💫','🌟','💚','🌱','🍃'];

function Badge({ status, label }) {
  const c = STATUS_COLOR[status] || '#888';
  return <span className={styles.badge} style={{ background: `${c}22`, color: c }}>{label || status}</span>;
}

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

  // ── Catégories ──
  const [categories, setCategories] = useState([]);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catForm, setCatForm] = useState({ id: null, name: '', description: '', image_url: '', icon: '📦', is_active: true, parent_id: '' });
  const [iconFilter, setIconFilter] = useState('');
  const [catFilterMode, setCatFilterMode] = useState('all');
  const [openCatIds, setOpenCatIds] = useState([]);

  // ── Artisans / Avis / Paiements / Analytiques ──
  const [artisans, setArtisans] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [payments, setPayments] = useState([]);
  const [analytics, setAnalytics] = useState({ orders: [], countries: {}, statuses: {} });

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
    const [{ count: orderCount }, { count: userCount }, { count: prodCount }, { count: pendCount }, { data: paymentsData }] = await Promise.all([
      sb.from('orders').select('id', { count: 'exact', head: true }),
      sb.from('users').select('id', { count: 'exact', head: true }),
      sb.from('products').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      sb.from('products').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      sb.from('payments').select('amount,status'),
    ]);
    const revenue = (paymentsData || []).filter((p) => p.status === 'paid').reduce((s, p) => s + Number(p.amount || 0), 0);
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

  // ── Catégories ──
  async function loadCategories() {
    const sb = getSupabase();
    const { data } = await sb.from('categories').select('*').order('name');
    setCategories(data || []);
  }

  function openAddCategory(parentId = '') {
    setCatForm({ id: null, name: '', description: '', image_url: '', icon: '📦', is_active: true, parent_id: parentId });
    setCatModalOpen(true);
  }
  function openEditCategory(cat) {
    setCatForm({ id: cat.id, name: cat.name || '', description: cat.description || '', image_url: cat.image_url || '', icon: cat.icon || '📦', is_active: cat.is_active !== false, parent_id: cat.parent_id || '' });
    setCatModalOpen(true);
  }
  async function saveCategory() {
    if (!catForm.name.trim()) { alert('Nom requis'); return; }
    const sb = getSupabase();
    const slug = catForm.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const payload = { name: catForm.name, slug, description: catForm.description || null, image_url: catForm.image_url || null, icon: catForm.icon || '📦', is_active: catForm.is_active, parent_id: catForm.parent_id || null };
    const { error } = catForm.id ? await sb.from('categories').update(payload).eq('id', catForm.id) : await sb.from('categories').insert([payload]);
    if (error) { alert('Erreur : ' + error.message); return; }
    setCatModalOpen(false);
    await loadCategories();
  }
  async function deleteCategory(id) {
    if (!confirm('Supprimer cette catégorie ?')) return;
    const sb = getSupabase();
    await sb.from('categories').delete().eq('id', id);
    await loadCategories();
  }
  async function toggleCatActive(cat) {
    const sb = getSupabase();
    await sb.from('categories').update({ is_active: !(cat.is_active !== false) }).eq('id', cat.id);
    await loadCategories();
  }
  function toggleCatOpen(id) {
    setOpenCatIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  // ── Artisans ──
  async function loadArtisans() {
    const sb = getSupabase();
    const { data } = await sb.from('users').select('*').eq('role', 'artisan').order('created_at', { ascending: false });
    setArtisans(data || []);
  }

  // ── Avis ──
  async function loadReviews() {
    const sb = getSupabase();
    const { data } = await sb.from('reviews').select('*, products(name), users(full_name)').order('created_at', { ascending: false });
    setReviews(data || []);
  }
  async function approveReview(id) {
    const sb = getSupabase();
    await sb.from('reviews').update({ status: 'approved' }).eq('id', id);
    await loadReviews();
  }
  async function rejectReview(id) {
    if (!confirm('Rejeter cet avis ?')) return;
    const sb = getSupabase();
    await sb.from('reviews').update({ status: 'rejected' }).eq('id', id);
    await loadReviews();
  }

  // ── Paiements ──
  async function loadPayments() {
    const sb = getSupabase();
    const { data } = await sb.from('payments').select('*').order('created_at', { ascending: false });
    setPayments(data || []);
  }

  // ── Analytiques ──
  async function loadAnalytics() {
    const sb = getSupabase();
    const { data } = await sb.from('orders').select('status,shipping_country');
    const ords = data || [];
    const statuses = {}; ords.forEach((o) => { statuses[o.status] = (statuses[o.status] || 0) + 1; });
    const countries = {}; ords.forEach((o) => { if (o.shipping_country) countries[o.shipping_country] = (countries[o.shipping_country] || 0) + 1; });
    setAnalytics({ orders: ords, statuses, countries });
  }

  function goTo(s) {
    setSection(s);
    if (s === 'validation') loadValidation();
    if (s === 'orders') loadOrders();
    if (s === 'users') loadUsers();
    if (s === 'categories') loadCategories();
    if (s === 'artisans') loadArtisans();
    if (s === 'reviews') loadReviews();
    if (s === 'payments') loadPayments();
    if (s === 'analytics') loadAnalytics();
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

  const catParents = categories.filter((c) => !c.parent_id);
  const catChildren = categories.filter((c) => c.parent_id);
  const visibleParents = catFilterMode === 'all' ? catParents : catParents.filter((c) => catFilterMode === 'active' ? c.is_active !== false : c.is_active === false);
  const filteredIcons = iconFilter ? ICONS.filter((i) => i.includes(iconFilter)) : ICONS;

  return (
    <div className={styles.wrap}>
      <aside className={styles.sidebar}>
        <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 16, padding: '0 12px' }}><span style={{ color: 'var(--accent)' }}>Wenna</span>Shop <span style={{ fontSize: 9, color: 'var(--accent)' }}>ADMIN</span></div>
        <button className={`${styles.navItem} ${section === 'dashboard' ? styles.navItemActive : ''}`} onClick={() => goTo('dashboard')}>Dashboard</button>
        <button className={`${styles.navItem} ${section === 'validation' ? styles.navItemActive : ''}`} onClick={() => goTo('validation')}>Validation ({kpis.pending})</button>
        <button className={`${styles.navItem} ${section === 'orders' ? styles.navItemActive : ''}`} onClick={() => goTo('orders')}>Commandes</button>
        <button className={`${styles.navItem} ${section === 'categories' ? styles.navItemActive : ''}`} onClick={() => goTo('categories')}>Catégories</button>
        <button className={`${styles.navItem} ${section === 'artisans' ? styles.navItemActive : ''}`} onClick={() => goTo('artisans')}>Artisans</button>
        <button className={`${styles.navItem} ${section === 'users' ? styles.navItemActive : ''}`} onClick={() => goTo('users')}>Utilisateurs</button>
        <button className={`${styles.navItem} ${section === 'reviews' ? styles.navItemActive : ''}`} onClick={() => goTo('reviews')}>Avis</button>
        <button className={`${styles.navItem} ${section === 'payments' ? styles.navItemActive : ''}`} onClick={() => goTo('payments')}>Paiements</button>
        <button className={`${styles.navItem} ${section === 'analytics' ? styles.navItemActive : ''}`} onClick={() => goTo('analytics')}>Analytiques</button>
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
                          {['pending', 'processing', 'shipped', 'delivered', 'cancelled'].map((s) => <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {section === 'categories' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <h1 style={{ fontSize: 22, fontWeight: 900 }}>Catégories</h1>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className={styles.btnGhost} onClick={loadCategories}>Actualiser</button>
                <button className={styles.btnPrimary} onClick={() => openAddCategory()}>+ Nouvelle</button>
              </div>
            </div>

            <div className={styles.statGrid} style={{ marginBottom: 16 }}>
              <div className={styles.statCard}><div className={styles.statNum} style={{ color: 'var(--accent)' }}>{categories.length}</div><div className={styles.statLabel}>Total</div></div>
              <div className={styles.statCard}><div className={styles.statNum} style={{ color: 'var(--success)' }}>{categories.filter((c) => c.is_active !== false).length}</div><div className={styles.statLabel}>Actives</div></div>
              <div className={styles.statCard}><div className={styles.statNum} style={{ color: 'var(--gold)' }}>{categories.filter((c) => c.image_url).length}</div><div className={styles.statLabel}>Avec image</div></div>
            </div>

            <div className={styles.tabs} style={{ marginBottom: 16 }}>
              <button className={`${styles.tabBtn} ${catFilterMode === 'all' ? styles.tabBtnActive : ''}`} onClick={() => setCatFilterMode('all')}>Toutes</button>
              <button className={`${styles.tabBtn} ${catFilterMode === 'active' ? styles.tabBtnActive : ''}`} onClick={() => setCatFilterMode('active')}>Actives</button>
              <button className={`${styles.tabBtn} ${catFilterMode === 'inactive' ? styles.tabBtnActive : ''}`} onClick={() => setCatFilterMode('inactive')}>Inactives</button>
            </div>

            {visibleParents.length === 0 ? (
              <div className={styles.card}><div className={styles.empty}>Aucune catégorie</div></div>
            ) : visibleParents.map((cat) => {
              const kids = catChildren.filter((c) => c.parent_id === cat.id);
              const isOpen = openCatIds.includes(cat.id);
              const isActive = cat.is_active !== false;
              return (
                <div className={styles.card} key={cat.id} style={{ marginBottom: 10, padding: 0, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', cursor: 'pointer' }} onClick={() => toggleCatOpen(cat.id)}>
                    <span style={{ fontSize: 22, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .2s', display: 'inline-block' }}>›</span>
                    <span style={{ fontSize: 22 }}>{cat.icon || '📦'}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: 14 }}>{cat.name}</div>
                      {cat.description && <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{cat.description}</div>}
                    </div>
                    <Badge status={isActive ? 'active' : 'inactive'} label={isActive ? 'Actif' : 'Inactif'} />
                    <div style={{ display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                      <button className={styles.btnSm} onClick={() => openEditCategory(cat)}>✎</button>
                      <button className={styles.btnDanger} onClick={() => deleteCategory(cat.id)}>✕</button>
                    </div>
                  </div>
                  {isOpen && (
                    <div style={{ borderTop: '1px solid var(--border)' }}>
                      {kids.map((kid) => (
                        <div key={kid.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 18px 9px 44px', borderBottom: '1px solid var(--border)' }}>
                          <span>{kid.icon || '•'}</span>
                          <div style={{ flex: 1, fontSize: 12, fontWeight: 700 }}>{kid.name}</div>
                          <Badge status={kid.is_active !== false ? 'active' : 'inactive'} label={kid.is_active !== false ? 'Actif' : 'Inactif'} />
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className={styles.btnSm} onClick={() => openEditCategory(kid)}>✎</button>
                            <button className={styles.btnDanger} onClick={() => deleteCategory(kid.id)}>✕</button>
                          </div>
                        </div>
                      ))}
                      <button className={styles.linkBtn} style={{ padding: '10px 18px 10px 44px', width: '100%', textAlign: 'left' }} onClick={() => openAddCategory(cat.id)}>+ Ajouter une sous-catégorie</button>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 18px', borderTop: '1px solid var(--border)' }}>
                        <button className={styles.btnGhost} onClick={() => toggleCatActive(cat)}>{isActive ? 'Désactiver' : 'Activer'}</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {section === 'artisans' && (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 18 }}>Artisans</h1>
            {artisans.length === 0 ? (
              <div className={styles.card}><div className={styles.empty}>Aucun artisan</div></div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                {artisans.map((u) => {
                  const name = u.full_name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || '—';
                  return (
                    <div className={styles.card} key={u.id}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                        <div style={{ width: 44, height: 44, background: 'var(--accent-light)', border: '1px solid var(--border-accent)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 18, color: 'var(--accent)' }}>{name[0]?.toUpperCase()}</div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{name}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>{flag(u.country)}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Badge status={u.status || 'active'} label={u.status || 'actif'} />
                        <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{fdate(u.created_at)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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

        {section === 'reviews' && (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 18 }}>Avis clients</h1>
            <div className={styles.card}>
              <table className={styles.table}>
                <thead><tr><th>Client</th><th>Produit</th><th>Note</th><th>Commentaire</th><th>Date</th><th>Statut</th><th>Actions</th></tr></thead>
                <tbody>
                  {reviews.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: 30, color: 'var(--text-faint)' }}>Aucun avis</td></tr>
                  ) : reviews.map((r) => (
                    <tr key={r.id}>
                      <td>{r.users?.full_name || '—'}</td>
                      <td style={{ color: 'var(--text-faint)' }}>{r.products?.name || '—'}</td>
                      <td style={{ color: 'var(--gold)' }}>{stars(r.rating)}</td>
                      <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-faint)' }}>{r.comment || '—'}</td>
                      <td style={{ color: 'var(--text-faint)' }}>{fdate(r.created_at)}</td>
                      <td><Badge status={r.status || 'pending'} label={r.status || 'pending'} /></td>
                      <td>
                        {r.status === 'pending' && (
                          <>
                            <button className={styles.btnSm} onClick={() => approveReview(r.id)}>✓</button>{' '}
                            <button className={styles.btnDanger} onClick={() => rejectReview(r.id)}>✕</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {section === 'payments' && (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 18 }}>Paiements</h1>
            <div className={styles.card}>
              <table className={styles.table}>
                <thead><tr><th>ID</th><th>Commande</th><th>Montant</th><th>Méthode</th><th>Statut</th><th>Date</th></tr></thead>
                <tbody>
                  {payments.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: 30, color: 'var(--text-faint)' }}>Aucun paiement</td></tr>
                  ) : payments.map((p) => (
                    <tr key={p.id}>
                      <td style={{ fontFamily: 'monospace' }}>{String(p.id).slice(0, 8).toUpperCase()}</td>
                      <td style={{ fontFamily: 'monospace', color: 'var(--text-faint)' }}>{p.order_id ? String(p.order_id).slice(0, 8).toUpperCase() : '—'}</td>
                      <td style={{ color: 'var(--accent)', fontWeight: 700 }}>{fmt(p.amount)}</td>
                      <td style={{ color: 'var(--text-faint)' }}>{p.method || '—'}</td>
                      <td><Badge status={p.status} /></td>
                      <td style={{ color: 'var(--text-faint)' }}>{fdate(p.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {section === 'analytics' && (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 18 }}>Analytiques</h1>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className={styles.card}>
                <div className={styles.cardTitle} style={{ marginBottom: 14 }}>Commandes par statut</div>
                {Object.keys(analytics.statuses).length === 0 ? <div className={styles.empty}>Aucune donnée</div> : Object.entries(analytics.statuses).map(([s, n]) => {
                  const max = Math.max(...Object.values(analytics.statuses));
                  return (
                    <div key={s} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, marginBottom: 5 }}><span>{s}</span><strong>{n}</strong></div>
                      <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}><div style={{ height: '100%', width: `${(n / max) * 100}%`, background: 'var(--accent)' }} /></div>
                    </div>
                  );
                })}
              </div>
              <div className={styles.card}>
                <div className={styles.cardTitle} style={{ marginBottom: 14 }}>Répartition par pays</div>
                {Object.keys(analytics.countries).length === 0 ? <div className={styles.empty}>Aucune donnée</div> : Object.entries(analytics.countries).map(([c, n]) => {
                  const max = Math.max(...Object.values(analytics.countries));
                  return (
                    <div key={c} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, marginBottom: 5 }}><span>{flag(c)}</span><strong>{n}</strong></div>
                      <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}><div style={{ height: '100%', width: `${(n / max) * 100}%`, background: 'var(--success)' }} /></div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

      </main>

      {catModalOpen && (
        <div className={styles.modalOv} onClick={() => setCatModalOpen(false)}>
          <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}>{catForm.id ? 'Modifier la catégorie' : 'Nouvelle catégorie'}</div>
            <div className={styles.modalBody}>
              {catForm.parent_id && (
                <div style={{ padding: '8px 12px', background: 'var(--accent-light)', border: '1px solid var(--border-accent)', borderRadius: 8, fontSize: 11, color: 'var(--text-faint)' }}>
                  Sous-catégorie de : <strong style={{ color: 'var(--text)' }}>{categories.find((c) => c.id === catForm.parent_id)?.name || '—'}</strong>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 9 }}>
                <div style={{ fontSize: 28 }}>{catForm.icon}</div>
                <input className={styles.input} style={{ width: 70, textAlign: 'center', fontSize: 18 }} value={catForm.icon} onChange={(e) => setCatForm({ ...catForm, icon: e.target.value })} />
              </div>
              <input className={styles.input} placeholder="Filtrer les icônes…" value={iconFilter} onChange={(e) => setIconFilter(e.target.value)} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 3, maxHeight: 140, overflowY: 'auto', padding: 4, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 9 }}>
                {filteredIcons.map((ic) => (
                  <div key={ic} onClick={() => setCatForm({ ...catForm, icon: ic })} style={{ padding: '7px 4px', textAlign: 'center', cursor: 'pointer', fontSize: 16, borderRadius: 6, background: catForm.icon === ic ? 'var(--accent-light)' : 'transparent', border: catForm.icon === ic ? '1px solid var(--border-accent)' : '1px solid transparent' }}>{ic}</div>
                ))}
              </div>
              <input className={styles.input} placeholder="Nom *" value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} />
              <input className={styles.input} placeholder="Description" value={catForm.description} onChange={(e) => setCatForm({ ...catForm, description: e.target.value })} />
              <input className={styles.input} placeholder="Image bannière (URL)" value={catForm.image_url} onChange={(e) => setCatForm({ ...catForm, image_url: e.target.value })} />
              <select className={styles.input} value={catForm.parent_id} onChange={(e) => setCatForm({ ...catForm, parent_id: e.target.value })}>
                <option value="">— Catégorie principale —</option>
                {catParents.filter((c) => c.id !== catForm.id).map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Activer immédiatement</span>
                <input type="checkbox" checked={catForm.is_active} onChange={(e) => setCatForm({ ...catForm, is_active: e.target.checked })} />
              </div>
              <button className={styles.btnPrimary} onClick={saveCategory}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
