'use client';

import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import styles from './admin.module.css';

function fmt(n, c = 'MAD') { try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: c }).format(n); } catch { return `${n} ${c}`; } }
function fdate(d) { return d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'; }
function flag(c) { const m = { Gabon: '🇬🇦', Maroc: '🇲🇦', Morocco: '🇲🇦', France: '🇫🇷' }; return `${m[c] || '🌍'} ${c || '—'}`; }
function stars(r) { return r ? '★'.repeat(Math.round(r)) + '☆'.repeat(5 - Math.round(r)) : '—'; }

const ORDER_STATUS_LABEL = { pending: 'En attente', processing: 'En cours', shipped: 'Expédié', delivered: 'Livré', cancelled: 'Annulé' };
const GOAL_METRIC_LABEL = { revenue: "Chiffre d'affaires", orders_count: 'Nombre de commandes', products_count: 'Nombre de produits', shop_completion: 'Complétion boutique', custom: 'Personnalisé (informatif)' };
const GOAL_AUDIENCE_LABEL = { artisan: 'Vendeurs', buyer: 'Acheteurs', all: 'Tous' };
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
  const [analytics, setAnalytics] = useState({ orders: [], countries: {}, statuses: {}, gmv: 0, commission: 0, avgBasket: 0, cancelRate: 0, months: [], vendorsNoProducts: [], topCategories: [], topVendors: [], reviewStats: { avg: '—', pending: 0, lowPct: 0 } });

  // ── Vitrine — sélection des photos produits (carrousel connexion) ──
  const [showcaseProducts, setShowcaseProducts] = useState([]);

  // ── Objectifs ──
  const [goals, setGoals] = useState([]);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [goalForm, setGoalForm] = useState({ id: null, audience: 'artisan', metric: 'revenue', title: '', description: '', target_value: '', period: 'monthly', is_active: true });

  // ── Paramètres — comptes bancaires ──
  const [bankAccounts, setBankAccounts] = useState([]);
  const [countries, setCountries] = useState([]);
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [bankForm, setBankForm] = useState({ idx: null, country_code: '', bank_name: '', holder: '', rib: '', swift: '' });

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
    const [
      { data: ordersData },
      { data: usersData },
      { data: productsData },
      { data: shopsData },
      { data: reviewsData },
      { data: categoriesData },
      { data: itemsData },
    ] = await Promise.all([
      sb.from('orders').select('status,shipping_country,total_amount,currency,created_at'),
      sb.from('users').select('id,full_name,email,role,status,created_at'),
      sb.from('products').select('seller_id,category_id,status'),
      sb.from('shops').select('id,user_id,name,commission_rate'),
      sb.from('reviews').select('rating,status'),
      sb.from('categories').select('id,name'),
      sb.from('order_items').select('quantity,unit_price,products(seller_id,category_id),orders(status,created_at)'),
    ]);

    const ords = ordersData || [];
    const statuses = {}; ords.forEach((o) => { statuses[o.status] = (statuses[o.status] || 0) + 1; });
    const delivered = ords.filter((o) => o.status === 'delivered');
    const gmv = delivered.reduce((s, o) => s + Number(o.total_amount || 0), 0);
    const cancelRate = ords.length ? Math.round((ords.filter((o) => o.status === 'cancelled').length / ords.length) * 100) : 0;

    const countries = {};
    ords.forEach((o) => {
      if (!o.shipping_country) return;
      if (!countries[o.shipping_country]) countries[o.shipping_country] = { orders: 0, revenue: 0 };
      countries[o.shipping_country].orders += 1;
      if (o.status === 'delivered') countries[o.shipping_country].revenue += Number(o.total_amount || 0);
    });

    // Croissance des comptes (6 derniers mois, acheteurs vs vendeurs)
    const users = usersData || [];
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString('fr-FR', { month: 'short' }), buyers: 0, vendors: 0, revenue: 0 });
    }
    const monthKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${x.getMonth()}`; };
    users.forEach((u) => {
      const m = months.find((x) => x.key === monthKey(u.created_at));
      if (!m) return;
      if (u.role === 'artisan') m.vendors += 1; else if (u.role === 'buyer') m.buyers += 1;
    });
    delivered.forEach((o) => {
      const m = months.find((x) => x.key === monthKey(o.created_at));
      if (m) m.revenue += Number(o.total_amount || 0);
    });

    // Vendeurs sans aucun produit actif — à relancer
    const products = productsData || [];
    const sellersWithActiveProduct = new Set(products.filter((p) => p.status === 'active').map((p) => p.seller_id));
    const artisansActive = users.filter((u) => u.role === 'artisan' && u.status === 'active');
    const vendorsNoProducts = artisansActive
      .filter((u) => !sellersWithActiveProduct.has(u.id))
      .map((u) => ({ id: u.id, name: u.full_name || 'Sans nom', email: u.email }));

    // Top catégories par nombre de produits actifs
    const catNames = new Map((categoriesData || []).map((c) => [c.id, c.name]));
    const catCounts = {};
    products.filter((p) => p.status === 'active').forEach((p) => { const name = catNames.get(p.category_id) || 'Sans catégorie'; catCounts[name] = (catCounts[name] || 0) + 1; });
    const topCategories = Object.entries(catCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);

    // Top vendeurs par revenu livré
    const shopByUser = new Map((shopsData || []).map((s) => [s.user_id, s.name]));
    const userById = new Map(users.map((u) => [u.id, u]));
    const items = itemsData || [];
    const revenueBySeller = {};
    items.forEach((it) => {
      if (it.orders?.status !== 'delivered' || !it.products?.seller_id) return;
      const sid = it.products.seller_id;
      revenueBySeller[sid] = (revenueBySeller[sid] || 0) + Number(it.unit_price || 0) * Number(it.quantity || 0);
    });
    const topVendors = Object.entries(revenueBySeller)
      .map(([sid, revenue]) => ({ id: sid, name: shopByUser.get(sid) || userById.get(sid)?.full_name || 'Boutique sans nom', email: userById.get(sid)?.email, revenue }))
      .sort((a, b) => b.revenue - a.revenue).slice(0, 5);

    // Santé des avis
    const reviews = reviewsData || [];
    const approvedReviews = reviews.filter((r) => r.status === 'approved');
    const reviewStats = {
      avg: approvedReviews.length ? (approvedReviews.reduce((s, r) => s + r.rating, 0) / approvedReviews.length).toFixed(1) : '—',
      pending: reviews.filter((r) => r.status === 'pending').length,
      lowPct: approvedReviews.length ? Math.round((approvedReviews.filter((r) => r.rating <= 2).length / approvedReviews.length) * 100) : 0,
    };

    setAnalytics({ orders: ords, statuses, countries, gmv, commission: gmv * 0.08, avgBasket: delivered.length ? gmv / delivered.length : 0, cancelRate, months, vendorsNoProducts, topCategories, topVendors, reviewStats });
  }

  // ── Vitrine ──
  async function loadShowcase() {
    const sb = getSupabase();
    const [{ data: products }, { data: ratings }] = await Promise.all([
      sb.from('products').select('id,name,image_url,is_featured,shops(name)').eq('status', 'active').not('image_url', 'is', null).order('created_at', { ascending: false }).limit(200),
      sb.from('product_ratings').select('product_id,avg_rating,review_count'),
    ]);
    const ratingMap = new Map((ratings || []).map((r) => [r.product_id, r]));
    const merged = (products || []).map((p) => ({ ...p, avg_rating: ratingMap.get(p.id)?.avg_rating ?? null, review_count: ratingMap.get(p.id)?.review_count ?? 0 }));
    merged.sort((a, b) => (b.is_featured - a.is_featured) || (b.avg_rating ?? -1) - (a.avg_rating ?? -1) || b.review_count - a.review_count);
    setShowcaseProducts(merged);
  }
  async function toggleFeatured(id, next) {
    const sb = getSupabase();
    await sb.from('products').update({ is_featured: next }).eq('id', id);
    setShowcaseProducts((prev) => prev.map((p) => (p.id === id ? { ...p, is_featured: next } : p)));
  }

  // ── Objectifs ──
  async function loadGoals() {
    const sb = getSupabase();
    const { data } = await sb.from('platform_goals').select('*').order('created_at', { ascending: false });
    setGoals(data || []);
  }
  function openAddGoal() {
    setGoalForm({ id: null, audience: 'artisan', metric: 'revenue', title: '', description: '', target_value: '', period: 'monthly', is_active: true });
    setGoalModalOpen(true);
  }
  function openEditGoal(g) {
    setGoalForm({ id: g.id, audience: g.audience, metric: g.metric, title: g.title, description: g.description || '', target_value: g.target_value, period: g.period, is_active: g.is_active });
    setGoalModalOpen(true);
  }
  async function saveGoal() {
    if (!goalForm.title.trim()) { alert('Titre requis'); return; }
    if (goalForm.metric !== 'custom' && (goalForm.target_value === '' || Number(goalForm.target_value) <= 0)) { alert('Objectif chiffré requis pour ce type'); return; }
    const sb = getSupabase();
    const { id, ...payload } = goalForm;
    payload.target_value = goalForm.metric === 'custom' ? 0 : Number(goalForm.target_value);
    const { error } = id ? await sb.from('platform_goals').update(payload).eq('id', id) : await sb.from('platform_goals').insert(payload);
    if (error) { alert('Erreur : ' + error.message); return; }
    setGoalModalOpen(false);
    await loadGoals();
  }
  async function toggleGoalActive(g) {
    const sb = getSupabase();
    await sb.from('platform_goals').update({ is_active: !g.is_active }).eq('id', g.id);
    await loadGoals();
  }
  async function deleteGoal(id) {
    if (!confirm('Supprimer cet objectif ?')) return;
    const sb = getSupabase();
    await sb.from('platform_goals').delete().eq('id', id);
    await loadGoals();
  }

  // ── Paramètres — comptes bancaires ──
  async function loadSettings() {
    const sb = getSupabase();
    const [{ data }, { data: countryRows }] = await Promise.all([
      sb.from('site_config').select('value').eq('key', 'bank_accounts').maybeSingle(),
      sb.from('countries').select('code,name,currency_code,flag_emoji').eq('status', 'ACTIVE').order('sort_order'),
    ]);
    let list = [];
    if (data?.value) { try { list = JSON.parse(data.value); } catch { list = []; } }
    setBankAccounts(Array.isArray(list) ? list : []);
    setCountries(countryRows || []);
  }
  function openAddBankAccount() {
    setBankForm({ idx: null, country_code: countries[0]?.code || '', bank_name: '', holder: '', rib: '', swift: '' });
    setBankModalOpen(true);
  }
  function openEditBankAccount(idx) {
    setBankForm({ idx, ...bankAccounts[idx] });
    setBankModalOpen(true);
  }
  async function persistBankAccounts(list) {
    const sb = getSupabase();
    const { error } = await sb.from('site_config').upsert({ key: 'bank_accounts', value: JSON.stringify(list), updated_at: new Date().toISOString() });
    if (error) { alert('Erreur : ' + error.message); return; }
    setBankAccounts(list);
  }
  async function saveBankAccount() {
    if (!bankForm.country_code) { alert('Pays requis'); return; }
    if (!bankForm.bank_name.trim() || !bankForm.rib.trim()) { alert('Banque et RIB requis'); return; }
    const country = countries.find((c) => c.code === bankForm.country_code);
    const { idx, ...form } = bankForm;
    const entry = { ...form, country_name: country?.name || '', flag: country?.flag_emoji || '', currency: country?.currency_code || '' };
    const next = [...bankAccounts];
    if (idx === null) next.push(entry); else next[idx] = entry;
    await persistBankAccounts(next);
    setBankModalOpen(false);
  }
  async function deleteBankAccount(idx) {
    if (!confirm('Supprimer ce compte ?')) return;
    await persistBankAccounts(bankAccounts.filter((_, i) => i !== idx));
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
    if (s === 'showcase') loadShowcase();
    if (s === 'goals') loadGoals();
    if (s === 'settings') loadSettings();
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
          <img src="/wenna_logo01.png" alt="WennaShop" style={{ height: 34, width: 'auto', marginBottom: 4 }} />
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '0 12px' }}>
          <img src="/wenna_logo01.png" alt="WennaShop" style={{ height: 26, width: 'auto' }} />
          <span style={{ fontSize: 9, fontWeight: 900, color: 'var(--accent)' }}>ADMIN</span>
        </div>
        <button className={`${styles.navItem} ${section === 'dashboard' ? styles.navItemActive : ''}`} onClick={() => goTo('dashboard')}>Dashboard</button>
        <button className={`${styles.navItem} ${section === 'validation' ? styles.navItemActive : ''}`} onClick={() => goTo('validation')}>Validation ({kpis.pending})</button>
        <button className={`${styles.navItem} ${section === 'orders' ? styles.navItemActive : ''}`} onClick={() => goTo('orders')}>Commandes</button>
        <button className={`${styles.navItem} ${section === 'categories' ? styles.navItemActive : ''}`} onClick={() => goTo('categories')}>Catégories</button>
        <button className={`${styles.navItem} ${section === 'artisans' ? styles.navItemActive : ''}`} onClick={() => goTo('artisans')}>Artisans</button>
        <button className={`${styles.navItem} ${section === 'users' ? styles.navItemActive : ''}`} onClick={() => goTo('users')}>Utilisateurs</button>
        <button className={`${styles.navItem} ${section === 'reviews' ? styles.navItemActive : ''}`} onClick={() => goTo('reviews')}>Avis</button>
        <button className={`${styles.navItem} ${section === 'payments' ? styles.navItemActive : ''}`} onClick={() => goTo('payments')}>Paiements</button>
        <button className={`${styles.navItem} ${section === 'analytics' ? styles.navItemActive : ''}`} onClick={() => goTo('analytics')}>Analytiques</button>
        <button className={`${styles.navItem} ${section === 'showcase' ? styles.navItemActive : ''}`} onClick={() => goTo('showcase')}>Vitrine</button>
        <button className={`${styles.navItem} ${section === 'goals' ? styles.navItemActive : ''}`} onClick={() => goTo('goals')}>Objectifs</button>
        <button className={`${styles.navItem} ${section === 'settings' ? styles.navItemActive : ''}`} onClick={() => goTo('settings')}>Paramètres</button>
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

            <div className={styles.statGrid} style={{ marginBottom: 16 }}>
              <div className={styles.statCard}><div className={styles.statNum} style={{ color: 'var(--accent)' }}>{fmt(analytics.gmv)}</div><div className={styles.statLabel}>GMV livrée</div></div>
              <div className={styles.statCard}><div className={styles.statNum} style={{ color: 'var(--gold)' }}>{fmt(analytics.commission)}</div><div className={styles.statLabel}>Commission (8%)</div></div>
              <div className={styles.statCard}><div className={styles.statNum}>{fmt(analytics.avgBasket)}</div><div className={styles.statLabel}>Panier moyen</div></div>
              <div className={styles.statCard}><div className={styles.statNum} style={{ color: analytics.cancelRate > 10 ? 'var(--error)' : 'var(--success)' }}>{analytics.cancelRate}%</div><div className={styles.statLabel}>Taux d'annulation</div></div>
            </div>

            <div className={styles.card} style={{ marginBottom: 16 }}>
              <div className={styles.cardTitle} style={{ marginBottom: 14 }}>Revenus livrés — 6 derniers mois</div>
              <div style={{ padding: '4px 4px 0' }}>
                <svg viewBox="0 0 300 140" style={{ width: '100%', height: 140 }}>
                  {(() => { const max = Math.max(1, ...analytics.months.map((m) => m.revenue)); return analytics.months.map((m, i) => {
                    const h = (m.revenue / max) * 100; const x = i * 50 + 8;
                    return (<g key={m.key}><rect x={x} y={120 - h} width="30" height={h} rx="4" fill="var(--accent)" opacity=".85" /><text x={x + 15} y="134" textAnchor="middle" fontSize="9" fill="var(--text-faint)">{m.label}</text></g>);
                  }); })()}
                </svg>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div className={styles.card}>
                <div className={styles.cardTitle} style={{ marginBottom: 14 }}>Nouveaux comptes — 6 derniers mois</div>
                {analytics.months.every((m) => m.buyers === 0 && m.vendors === 0) ? <div className={styles.empty}>Aucune donnée</div> : (
                  <>
                    <div style={{ display: 'flex', gap: 14, fontSize: 10, marginBottom: 10 }}>
                      <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--accent)', marginRight: 4 }} />Acheteurs</span>
                      <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--gold)', marginRight: 4 }} />Vendeurs</span>
                    </div>
                    {analytics.months.map((m) => {
                      const max = Math.max(1, ...analytics.months.map((x) => x.buyers + x.vendors));
                      return (
                        <div key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <span style={{ fontSize: 10, color: 'var(--text-faint)', width: 28 }}>{m.label}</span>
                          <div style={{ flex: 1, display: 'flex', height: 10, borderRadius: 3, overflow: 'hidden', background: 'var(--surface-2)' }}>
                            <div style={{ width: `${(m.buyers / max) * 100}%`, background: 'var(--accent)' }} />
                            <div style={{ width: `${(m.vendors / max) * 100}%`, background: 'var(--gold)' }} />
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 700 }}>{m.buyers + m.vendors}</span>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>

              <div className={styles.card}>
                <div className={styles.cardTitle} style={{ marginBottom: 14 }}>Répartition par pays</div>
                {Object.keys(analytics.countries).length === 0 ? <div className={styles.empty}>Aucune donnée</div> : Object.entries(analytics.countries).sort((a, b) => b[1].revenue - a[1].revenue).map(([c, v]) => {
                  const max = Math.max(...Object.values(analytics.countries).map((x) => x.revenue), 1);
                  return (
                    <div key={c} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, marginBottom: 5 }}><span>{flag(c)}</span><span>{fmt(v.revenue)} · {v.orders} cmd</span></div>
                      <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}><div style={{ height: '100%', width: `${(v.revenue / max) * 100}%`, background: 'var(--success)' }} /></div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div className={styles.card}>
                <div className={styles.cardTitle} style={{ marginBottom: 14 }}>Top 5 vendeurs (CA livré)</div>
                {analytics.topVendors.length === 0 ? <div className={styles.empty}>Aucune donnée</div> : analytics.topVendors.map((v, i) => (
                  <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderTop: i > 0 ? '1px solid var(--border)' : 'none', fontSize: 12 }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{v.name}</div>
                      {v.email && <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>{v.email}</div>}
                    </div>
                    <span style={{ color: 'var(--accent)', fontWeight: 800 }}>{fmt(v.revenue)}</span>
                  </div>
                ))}
              </div>
              <div className={styles.card}>
                <div className={styles.cardTitle} style={{ marginBottom: 14 }}>Top catégories (produits actifs)</div>
                {analytics.topCategories.length === 0 ? <div className={styles.empty}>Aucune donnée</div> : analytics.topCategories.map(([name, count], i) => {
                  const max = analytics.topCategories[0][1];
                  return (
                    <div key={name} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, marginBottom: 4 }}><span>{name}</span><strong>{count}</strong></div>
                      <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}><div style={{ height: '100%', width: `${(count / max) * 100}%`, background: 'var(--accent)' }} /></div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className={styles.card} style={{ padding: 18, borderColor: analytics.vendorsNoProducts.length > 0 ? 'rgba(239,68,68,.3)' : undefined }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: analytics.vendorsNoProducts.length > 0 ? 12 : 0 }}>
                  <i className="ph ph-warning" style={{ fontSize: 20, color: analytics.vendorsNoProducts.length > 0 ? 'var(--error)' : 'var(--success)' }} />
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 900 }}>{analytics.vendorsNoProducts.length}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>Vendeur{analytics.vendorsNoProducts.length > 1 ? 's' : ''} actif{analytics.vendorsNoProducts.length > 1 ? 's' : ''} sans produit — à relancer</div>
                  </div>
                </div>
                {analytics.vendorsNoProducts.length > 0 && (
                  <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                    {analytics.vendorsNoProducts.map((v) => (
                      <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderTop: '1px solid var(--border)', fontSize: 11 }}>
                        <span style={{ fontWeight: 700 }}>{v.name}</span>
                        <span style={{ color: 'var(--text-faint)', fontFamily: 'monospace' }}>{v.email || v.id.slice(0, 8)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className={styles.card} style={{ padding: 18 }}>
                <div style={{ display: 'flex', gap: 24 }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--gold)' }}>{analytics.reviewStats.avg}★</div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>Note moyenne</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: analytics.reviewStats.pending > 0 ? 'var(--gold)' : 'var(--text)' }}>{analytics.reviewStats.pending}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>Avis à modérer</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: analytics.reviewStats.lowPct > 15 ? 'var(--error)' : 'var(--text)' }}>{analytics.reviewStats.lowPct}%</div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>Avis ≤ 2★</div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {section === 'showcase' && (
          <>
            <div style={{ marginBottom: 18 }}>
              <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 4 }}>Vitrine</h1>
              <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Sélectionne les photos affichées en carrousel sur la page de connexion. Les produits "En vitrine" passent en premier ; le reste du carrousel se complète automatiquement avec les mieux notés, triés ci-dessous par note.</p>
            </div>
            <div className={styles.card}>
              <table className={styles.table}>
                <thead><tr><th></th><th>Produit</th><th>Boutique</th><th>Note</th><th>Vitrine</th></tr></thead>
                <tbody>
                  {showcaseProducts.length === 0 ? (
                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: 30, color: 'var(--text-faint)' }}>Aucun produit actif avec photo</td></tr>
                  ) : showcaseProducts.map((p) => (
                    <tr key={p.id}>
                      <td><img src={p.image_url} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }} /></td>
                      <td>{p.name}</td>
                      <td style={{ color: 'var(--text-faint)' }}>{p.shops?.name || '—'}</td>
                      <td style={{ color: 'var(--gold)' }}>{p.avg_rating ? `${stars(p.avg_rating)} (${p.review_count})` : '—'}</td>
                      <td>
                        <button className={p.is_featured ? styles.btnSm : styles.btnGhost} onClick={() => toggleFeatured(p.id, !p.is_featured)}>
                          {p.is_featured ? '✓ En vitrine' : 'Mettre en vitrine'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {section === 'goals' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div>
                <h1 style={{ fontSize: 22, fontWeight: 900 }}>Objectifs</h1>
                <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 4 }}>Affichés sur le dashboard des vendeurs (et acheteurs si ciblés) avec une barre de progression calculée automatiquement.</p>
              </div>
              <button className={styles.btnPrimary} onClick={openAddGoal}>+ Nouvel objectif</button>
            </div>
            <div className={styles.card}>
              <table className={styles.table}>
                <thead><tr><th>Titre</th><th>Cible</th><th>Type</th><th>Objectif</th><th>Période</th><th>Statut</th><th></th></tr></thead>
                <tbody>
                  {goals.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: 30, color: 'var(--text-faint)' }}>Aucun objectif défini</td></tr>
                  ) : goals.map((g) => (
                    <tr key={g.id}>
                      <td>{g.title}</td>
                      <td style={{ color: 'var(--text-faint)' }}>{GOAL_AUDIENCE_LABEL[g.audience]}</td>
                      <td style={{ color: 'var(--text-faint)' }}>{GOAL_METRIC_LABEL[g.metric]}</td>
                      <td>{g.metric === 'custom' ? '—' : g.metric === 'revenue' ? fmt(g.target_value) : g.target_value}</td>
                      <td style={{ color: 'var(--text-faint)' }}>{g.period === 'monthly' ? 'Ce mois' : 'Permanent'}</td>
                      <td><Badge status={g.is_active ? 'active' : 'inactive'} label={g.is_active ? 'Actif' : 'Inactif'} /></td>
                      <td>
                        <button className={styles.btnSm} onClick={() => openEditGoal(g)}>✎</button>{' '}
                        <button className={styles.btnGhost} onClick={() => toggleGoalActive(g)}>{g.is_active ? 'Désactiver' : 'Activer'}</button>{' '}
                        <button className={styles.btnDanger} onClick={() => deleteGoal(g.id)}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {section === 'settings' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h1 style={{ fontSize: 22, fontWeight: 900 }}>Paramètres</h1>
            </div>
            <div className={styles.card}>
              <div className={styles.cardTitle} style={{ marginBottom: 4 }}>Comptes bancaires — virement</div>
              <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 14 }}>Affichés aux acheteurs qui choisissent "Virement bancaire" au paiement. Un compte par devise si besoin.</p>
              <table className={styles.table}>
                <thead><tr><th>Pays</th><th>Devise</th><th>Banque</th><th>Titulaire</th><th>RIB</th><th>SWIFT</th><th></th></tr></thead>
                <tbody>
                  {bankAccounts.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: 30, color: 'var(--text-faint)' }}>Aucun compte — le virement bancaire est masqué au paiement tant qu'aucun compte n'est ajouté.</td></tr>
                  ) : bankAccounts.map((a, i) => (
                    <tr key={i}>
                      <td>{a.flag} {a.country_name}</td>
                      <td>{a.currency}</td>
                      <td>{a.bank_name}</td>
                      <td style={{ color: 'var(--text-faint)' }}>{a.holder || '—'}</td>
                      <td style={{ fontFamily: 'monospace' }}>{a.rib}</td>
                      <td style={{ color: 'var(--text-faint)' }}>{a.swift || '—'}</td>
                      <td>
                        <button className={styles.btnSm} onClick={() => openEditBankAccount(i)}>✎</button>{' '}
                        <button className={styles.btnDanger} onClick={() => deleteBankAccount(i)}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className={styles.btnPrimary} style={{ marginTop: 14 }} onClick={openAddBankAccount}>+ Ajouter un compte</button>
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

      {goalModalOpen && (
        <div className={styles.modalOv} onClick={() => setGoalModalOpen(false)}>
          <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}>{goalForm.id ? "Modifier l'objectif" : 'Nouvel objectif'}</div>
            <div className={styles.modalBody}>
              <select className={styles.input} value={goalForm.audience} onChange={(e) => setGoalForm({ ...goalForm, audience: e.target.value })}>
                <option value="artisan">Vendeurs</option>
                <option value="buyer">Acheteurs</option>
                <option value="all">Tous</option>
              </select>
              <select className={styles.input} value={goalForm.metric} onChange={(e) => setGoalForm({ ...goalForm, metric: e.target.value })}>
                <option value="revenue">Chiffre d'affaires (vendeurs)</option>
                <option value="orders_count">Nombre de commandes</option>
                <option value="products_count">Nombre de produits (vendeurs)</option>
                <option value="shop_completion">Complétion boutique (vendeurs)</option>
                <option value="custom">Personnalisé — message informatif sans chiffre</option>
              </select>
              <input className={styles.input} placeholder="Titre *" value={goalForm.title} onChange={(e) => setGoalForm({ ...goalForm, title: e.target.value })} />
              <textarea className={styles.input} rows={2} placeholder="Description (optionnel)" value={goalForm.description} onChange={(e) => setGoalForm({ ...goalForm, description: e.target.value })} />
              {goalForm.metric !== 'custom' && (
                <input className={styles.input} type="number" min="0" placeholder="Valeur cible *" value={goalForm.target_value} onChange={(e) => setGoalForm({ ...goalForm, target_value: e.target.value })} />
              )}
              <select className={styles.input} value={goalForm.period} onChange={(e) => setGoalForm({ ...goalForm, period: e.target.value })}>
                <option value="monthly">Ce mois-ci (se réinitialise chaque mois)</option>
                <option value="all_time">Permanent (cumulé depuis toujours)</option>
              </select>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Actif immédiatement</span>
                <input type="checkbox" checked={goalForm.is_active} onChange={(e) => setGoalForm({ ...goalForm, is_active: e.target.checked })} />
              </div>
              <button className={styles.btnPrimary} onClick={saveGoal}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {bankModalOpen && (
        <div className={styles.modalOv} onClick={() => setBankModalOpen(false)}>
          <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}>{bankForm.idx === null ? 'Nouveau compte' : 'Modifier le compte'}</div>
            <div className={styles.modalBody}>
              <select className={styles.input} value={bankForm.country_code} onChange={(e) => setBankForm({ ...bankForm, country_code: e.target.value })}>
                <option value="">— Pays * —</option>
                {countries.map((c) => <option key={c.code} value={c.code}>{c.flag_emoji} {c.name} — {c.currency_code}</option>)}
              </select>
              <input className={styles.input} placeholder="Banque *" value={bankForm.bank_name} onChange={(e) => setBankForm({ ...bankForm, bank_name: e.target.value })} />
              <input className={styles.input} placeholder="Titulaire du compte" value={bankForm.holder} onChange={(e) => setBankForm({ ...bankForm, holder: e.target.value })} />
              <input className={styles.input} placeholder="RIB *" value={bankForm.rib} onChange={(e) => setBankForm({ ...bankForm, rib: e.target.value })} />
              <input className={styles.input} placeholder="SWIFT / BIC" value={bankForm.swift} onChange={(e) => setBankForm({ ...bankForm, swift: e.target.value })} />
              <button className={styles.btnPrimary} onClick={saveBankAccount}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
