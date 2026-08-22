'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
import styles from './vendeur.module.css';

// ─────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────
const COUNTRIES = ['Maroc', 'Gabon', 'Sénégal', "Côte d'Ivoire", 'Cameroun', 'RDC', 'Congo', 'Mali', 'Burkina Faso', 'Niger', 'Guinée', 'Bénin', 'Togo', 'Tchad', 'Madagascar', 'Mauritanie', 'Comores', 'Djibouti', 'Autre'];

const STATUS_LABEL = { pending: 'En attente', active: 'Actif', inactive: 'Inactif', processing: 'En traitement', shipped: 'Expédiée', delivered: 'Livrée', cancelled: 'Annulée', approved: 'Approuvé', paid: 'Payé' };
const STATUS_COLOR = { pending: '#f59e0b', active: '#22c55e', inactive: '#555', processing: '#3b82f6', shipped: '#3b82f6', delivered: '#22c55e', cancelled: '#ef4444', approved: '#22c55e', paid: '#22c55e' };

const NOTIF_ICON = { order: 'ph-shopping-bag', money: 'ph-currency-circle-dollar', review: 'ph-star', stock: 'ph-warning', system: 'ph-bell' };

function fmt(n, c = 'MAD') { try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: c, minimumFractionDigits: 0 }).format(n || 0); } catch { return `${n || 0} ${c}`; } }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; }
function timeAgo(d) {
  if (!d) return '';
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86400)} j`;
}
const PAGE_SIZE = 10;

export default function VendeurPage() {
  const router = useRouter();

  // Auth / seller
  const [checking, setChecking] = useState(true);
  const [seller, setSeller] = useState(null);
  const [shop, setShop] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [categories, setCategories] = useState([]);

  // Layout
  const [section, setSection] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState(null);

  // Notifications
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notifTab, setNotifTab] = useState('all');
  const [pushToast, setPushToast] = useState(null);

  // Overview
  const [overview, setOverview] = useState({ products: 0, orders: 0, revenue: 0, rating: 0 });
  const [recentOrders, setRecentOrders] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [openQuests, setOpenQuests] = useState({ count: 0, reward: 0 });
  const [chartData, setChartData] = useState([]);

  // Products
  const [products, setProducts] = useState([]);
  const [prodTotal, setProdTotal] = useState(0);
  const [prodPage, setProdPage] = useState(1);
  const [prodSearch, setProdSearch] = useState('');
  const [prodStatus, setProdStatus] = useState('');
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [productTab, setProductTab] = useState('info');
  const [productForm, setProductForm] = useState(emptyProduct());
  const [productImages, setProductImages] = useState([]);
  const [caracs, setCaracs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  function emptyProduct() {
    return { id: null, name: '', description: '', price: '', stock: '', country: 'Maroc', origin_city: '', category_id: '', status: 'pending', brand: '', sku: '', compare_price: '', delivery_days: '', material: '', color: '', weight: '', dimensions: '' };
  }

  // Orders
  const [myOrderIds, setMyOrderIds] = useState([]);
  const [orders, setOrders] = useState([]);
  const [orderStatus, setOrderStatus] = useState('');
  const [orderModal, setOrderModal] = useState(null);
  const [orderItemsDetail, setOrderItemsDetail] = useState([]);
  const [shipTracking, setShipTracking] = useState('');
  const [shipEta, setShipEta] = useState('');
  const [newStatus, setNewStatus] = useState('pending');

  // Revenue
  const [revenue, setRevenue] = useState({ total: 0, month: 0, commission: 0, avg: 0 });
  const [payments, setPayments] = useState([]);

  // Wallet & boosts
  const [boosts, setBoosts] = useState([]);
  const [boostPacks, setBoostPacks] = useState([]);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [selectedPack, setSelectedPack] = useState(null);

  // Reviews
  const [reviews, setReviews] = useState([]);
  const [reviewFilter, setReviewFilter] = useState('');
  const [reviewStats, setReviewStats] = useState({ avg: 0, total: 0, approved: 0 });

  // Shop form
  const [shopForm, setShopForm] = useState({ name: '', slug: '', bio: '', city: '', country: 'Maroc', logo_url: '', banner_url: '', whatsapp: '', instagram: '', facebook: '', tiktok: '', shop_policies: '' });

  // Profile form
  const [profileForm, setProfileForm] = useState({ first_name: '', last_name: '', specialty: '', country: 'Maroc' });
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deleteAccountText, setDeleteAccountText] = useState('');

  function showToast(msg, type = '') { setToast({ msg, type }); setTimeout(() => setToast(null), 3200); }

  // ── Auth + chargement initial ──
  useEffect(() => {
    (async () => {
      const sb = getSupabase();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { router.push('/connexion'); return; }
      const { data: user } = await sb.from('users').select('*').eq('auth_id', session.user.id).single();
      if (!user || (user.role !== 'artisan' && user.role !== 'admin')) { router.push('/compte'); return; }
      setSeller(user);
      setProfileForm({ first_name: user.first_name || '', last_name: user.last_name || '', specialty: user.specialty || '', country: user.country || 'Maroc' });

      const [{ data: shopRow }, { data: walletRow }, { data: cats }] = await Promise.all([
        sb.from('shops').select('*').eq('user_id', user.id).maybeSingle(),
        sb.from('vendor_wallets').select('*').eq('user_id', user.id).maybeSingle(),
        sb.from('categories').select('id,name').eq('is_active', true).order('sort_order', { ascending: true }),
      ]);
      setShop(shopRow || null);
      if (shopRow) setShopForm({
        name: shopRow.name || '', slug: shopRow.slug || '', bio: shopRow.bio || '', city: shopRow.city || '',
        country: shopRow.country || 'Maroc', logo_url: shopRow.logo_url || '', banner_url: shopRow.banner_url || '',
        whatsapp: shopRow.whatsapp || '', instagram: shopRow.instagram || '', facebook: shopRow.facebook || '', tiktok: shopRow.tiktok || '',
        shop_policies: shopRow.shop_policies || '',
      });
      setWallet(walletRow || { balance: 0, currency: 'MAD' });
      setCategories(cats || []);

      // Ids des commandes contenant au moins un de mes produits (base pour Commandes + Revenus)
      const { data: myProds } = await sb.from('products').select('id').eq('seller_id', user.id);
      const prodIds = (myProds || []).map((p) => p.id);
      let orderIds = [];
      if (prodIds.length) {
        const { data: items } = await sb.from('order_items').select('order_id').in('product_id', prodIds);
        orderIds = [...new Set((items || []).map((i) => i.order_id))];
      }
      setMyOrderIds(orderIds);

      await loadOverview(sb, user, shopRow, prodIds, orderIds);
      await loadNotifications(sb, user.id);
      setChecking(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Notifications temps réel ──
  useEffect(() => {
    if (!seller) return;
    const sb = getSupabase();
    const channel = sb.channel('vendeur-notifs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${seller.id}` }, (payload) => {
        setNotifications((prev) => [payload.new, ...prev]);
        setPushToast(payload.new);
        setTimeout(() => setPushToast(null), 6000);
      })
      .subscribe();
    return () => sb.removeChannel(channel);
  }, [seller]);

  // ── Chargement par section (paresseux, comme dans l'admin) ──
  useEffect(() => {
    if (!seller) return;
    const sb = getSupabase();
    if (section === 'products') loadProducts(sb);
    if (section === 'orders') loadOrders(sb);
    if (section === 'revenue') loadRevenue(sb);
    if (section === 'wallet') loadWalletSection(sb);
    if (section === 'reviews') loadReviews(sb);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, seller, prodPage, prodStatus, orderStatus, reviewFilter]);

  async function loadOverview(sb, user, shopRow, prodIds, orderIds) {
    const { data: activeProds } = await sb.from('products').select('id', { count: 'exact', head: true }).eq('seller_id', user.id).eq('status', 'active');
    let ordersList = [];
    if (orderIds.length) {
      const { data: o } = await sb.from('orders').select('id,total_amount,status,created_at,shipping_name,currency').in('id', orderIds).order('created_at', { ascending: false });
      ordersList = o || [];
    }
    const delivered = ordersList.filter((o) => o.status === 'delivered');
    setOverview({
      products: activeProds?.count ?? 0,
      orders: ordersList.length,
      revenue: delivered.reduce((s, o) => s + Number(o.total_amount || 0), 0),
      rating: shopRow?.rating_avg ? Number(shopRow.rating_avg).toFixed(1) : '—',
    });
    setRecentOrders(ordersList.slice(0, 5));

    if (prodIds.length) {
      const { data: low } = await sb.from('products').select('id,name,stock,image_url').eq('seller_id', user.id).lte('stock', 3).eq('status', 'active').order('stock', { ascending: true }).limit(5);
      setLowStock(low || []);
    }

    const { data: quests } = await sb.from('quests').select('reward_amount').eq('status', 'open');
    setOpenQuests({ count: (quests || []).length, reward: (quests || []).reduce((s, q) => s + Number(q.reward_amount || 0), 0) });

    // Graphique : revenus livrés des 6 derniers mois
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString('fr-FR', { month: 'short' }), total: 0 });
    }
    delivered.forEach((o) => {
      const d = new Date(o.created_at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const m = months.find((x) => x.key === key);
      if (m) m.total += Number(o.total_amount || 0);
    });
    setChartData(months);
  }

  async function loadNotifications(sb, userId) {
    const { data } = await sb.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(50);
    setNotifications(data || []);
  }

  async function markAllRead() {
    const sb = getSupabase();
    await sb.from('notifications').update({ is_read: true }).eq('user_id', seller.id).eq('is_read', false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

  async function openNotif(n) {
    if (!n.is_read) {
      const sb = getSupabase();
      await sb.from('notifications').update({ is_read: true }).eq('id', n.id);
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
    }
    if (n.link) router.push(n.link);
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const filteredNotifs = notifTab === 'all' ? notifications : notifications.filter((n) => n.type === notifTab);

  // ── PRODUCTS ──
  async function loadProducts(sb) {
    const offset = (prodPage - 1) * PAGE_SIZE;
    let q = sb.from('products').select('id,name,price,stock,status,image_url,images', { count: 'exact' }).eq('seller_id', seller.id).order('created_at', { ascending: false }).range(offset, offset + PAGE_SIZE - 1);
    if (prodStatus) q = q.eq('status', prodStatus);
    if (prodSearch.trim()) q = q.ilike('name', `%${prodSearch.trim()}%`);
    const { data, count } = await q;
    setProducts(data || []);
    setProdTotal(count || 0);
  }

  function openProductModal(p = null) {
    if (p) {
      setProductForm({
        id: p.id, name: p.name || '', description: p.description || '', price: p.price ?? '', stock: p.stock ?? '',
        country: p.country || 'Maroc', origin_city: p.origin_city || '', category_id: p.category_id || '', status: p.status || 'pending',
        brand: p.brand || '', sku: p.sku || '', compare_price: p.compare_price ?? '', delivery_days: p.delivery_days ?? '',
        material: p.material || '', color: p.color || '', weight: p.weight || '', dimensions: p.dimensions || '',
      });
      setProductImages(Array.isArray(p.images) && p.images.length ? p.images : (p.image_url ? [p.image_url] : []));
      setCaracs(p.characteristics ? Object.entries(p.characteristics).map(([k, v]) => ({ k, v })) : []);
    } else {
      setProductForm(emptyProduct());
      setProductImages([]);
      setCaracs([]);
    }
    setProductTab('info');
    setProductModalOpen(true);
  }

  async function handleProductFiles(files) {
    if (!files || !files.length) return;
    setUploading(true);
    const sb = getSupabase();
    const uploaded = [];
    for (const file of Array.from(files)) {
      const path = `products/${seller.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '')}`;
      const { error } = await sb.storage.from('products').upload(path, file, { upsert: true });
      if (!error) {
        const { data } = sb.storage.from('products').getPublicUrl(path);
        uploaded.push(data.publicUrl);
      }
    }
    setProductImages((prev) => [...prev, ...uploaded]);
    setUploading(false);
  }

  function addImgFromUrl(url) {
    if (!url.trim()) return;
    setProductImages((prev) => [...prev, url.trim()]);
  }
  function removeImg(idx) { setProductImages((prev) => prev.filter((_, i) => i !== idx)); }

  function addCarac() { setCaracs((prev) => [...prev, { k: '', v: '' }]); }
  function updateCarac(i, field, val) { setCaracs((prev) => prev.map((c, idx) => (idx === i ? { ...c, [field]: val } : c))); }
  function removeCarac(i) { setCaracs((prev) => prev.filter((_, idx) => idx !== i)); }

  async function saveProduct() {
    if (!productForm.name || !productForm.price || productForm.stock === '') { showToast('Nom, prix et stock sont requis', 'error'); return; }
    const sb = getSupabase();
    const characteristics = {};
    caracs.forEach((c) => { if (c.k.trim()) characteristics[c.k.trim()] = c.v; });
    const payload = {
      name: productForm.name, description: productForm.description || null,
      price: parseFloat(productForm.price), stock: parseInt(productForm.stock) || 0,
      country: productForm.country, origin_city: productForm.origin_city || null,
      category_id: productForm.category_id || null, status: productForm.status,
      brand: productForm.brand || null, sku: productForm.sku || null,
      compare_price: productForm.compare_price ? parseFloat(productForm.compare_price) : null,
      delivery_days: productForm.delivery_days ? parseInt(productForm.delivery_days) : null,
      material: productForm.material || null, color: productForm.color || null,
      weight: productForm.weight || null, dimensions: productForm.dimensions || null,
      images: productImages, image_url: productImages[0] || null,
      characteristics, shop_id: shop?.id || null, seller_id: seller.id,
    };
    let error;
    if (productForm.id) {
      ({ error } = await sb.from('products').update(payload).eq('id', productForm.id));
    } else {
      ({ error } = await sb.from('products').insert(payload));
    }
    if (error) { showToast('Erreur : ' + error.message, 'error'); return; }
    showToast(productForm.id ? 'Produit mis à jour' : 'Produit créé', 'success');
    setProductModalOpen(false);
    await loadProducts(sb);
  }

  async function confirmDeleteProduct() {
    const sb = getSupabase();
    await sb.from('products').delete().eq('id', deleteTarget);
    setDeleteTarget(null);
    showToast('Produit supprimé', 'success');
    await loadProducts(sb);
  }

  // ── ORDERS ──
  async function loadOrders(sb) {
    if (!myOrderIds.length) { setOrders([]); return; }
    let q = sb.from('orders').select('id,total_amount,currency,status,tracking_number,shipping_name,shipping_city,created_at').in('id', myOrderIds).order('created_at', { ascending: false });
    if (orderStatus) q = q.eq('status', orderStatus);
    const { data } = await q;
    setOrders(data || []);
  }

  async function openOrderModal(o) {
    setOrderModal(o);
    setNewStatus(o.status);
    setShipTracking(o.tracking_number || '');
    setShipEta('');
    const sb = getSupabase();
    const { data } = await sb.from('order_items').select('quantity,unit_price,products(name,image_url,seller_id)').eq('order_id', o.id);
    setOrderItemsDetail((data || []).filter((it) => it.products?.seller_id === seller.id));
  }

  async function updateOrderStatus() {
    const sb = getSupabase();
    await sb.from('orders').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', orderModal.id);
    showToast('Statut mis à jour', 'success');
    setOrderModal((prev) => ({ ...prev, status: newStatus }));
    await loadOrders(sb);
  }

  async function shipOrder() {
    if (!shipTracking.trim()) { showToast('Numéro de suivi requis', 'error'); return; }
    const sb = getSupabase();
    await sb.from('orders').update({ status: 'shipped', tracking_number: shipTracking.trim(), updated_at: new Date().toISOString() }).eq('id', orderModal.id);
    const { data: existingDelivery } = await sb.from('deliveries').select('id').eq('order_id', orderModal.id).maybeSingle();
    const deliveryPayload = { status: 'in_transit', picked_up_at: new Date().toISOString(), estimated_delivery: shipEta || null };
    if (existingDelivery) await sb.from('deliveries').update(deliveryPayload).eq('id', existingDelivery.id);
    else await sb.from('deliveries').insert({ order_id: orderModal.id, ...deliveryPayload });
    showToast('Commande expédiée', 'success');
    setOrderModal(null);
    await loadOrders(sb);
  }

  // ── REVENUE ──
  async function loadRevenue(sb) {
    if (!myOrderIds.length) { setRevenue({ total: 0, month: 0, commission: 0, avg: 0 }); setPayments([]); return; }
    const { data: pays } = await sb.from('payments').select('id,order_id,amount,currency,status,type,created_at').in('order_id', myOrderIds).order('created_at', { ascending: false });
    const list = pays || [];
    const rate = shop?.commission_rate ? Number(shop.commission_rate) / 100 : 0.08;
    const now = new Date();
    const thisMonth = list.filter((p) => { const d = new Date(p.created_at); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
    const total = list.reduce((s, p) => s + Number(p.amount || 0), 0);
    setRevenue({
      total, month: thisMonth.reduce((s, p) => s + Number(p.amount || 0), 0),
      commission: total * rate, avg: list.length ? total / list.length : 0,
    });
    setPayments(list.map((p) => ({ ...p, commission: Number(p.amount) * rate, net: Number(p.amount) * (1 - rate) })));
  }

  // ── WALLET ──
  async function loadWalletSection(sb) {
    const { data: b } = await sb.from('boosts').select('*, boost_packs(name)').eq('user_id', seller.id).order('created_at', { ascending: false });
    setBoosts(b || []);
    const { data: packs } = await sb.from('boost_packs').select('*').eq('is_active', true).order('sort_order', { ascending: true });
    setBoostPacks(packs || []);
  }

  async function requestRecharge() {
    if (!selectedPack) return;
    const sb = getSupabase();
    const amount = selectedPack.price_mad || selectedPack.price_fcfa;
    const currency = selectedPack.price_mad ? 'MAD' : 'FCFA';
    await sb.from('payments').insert({ user_id: seller.id, amount, currency, method: 'cash_on_delivery', status: 'pending', type: 'wallet_recharge', metadata: { pack_id: selectedPack.id, pack_name: selectedPack.name } });
    await sb.from('wallet_transactions').insert({ user_id: seller.id, type: 'recharge_request', amount, currency, description: `Demande de recharge — ${selectedPack.name}`, status: 'pending' });
    showToast('Demande envoyée — en attente de confirmation', 'success');
    setRechargeOpen(false);
    setSelectedPack(null);
  }

  async function activateBoost(target) {
    // target = { type: 'shop'|'product', product_id? }
    if (!selectedPack) { showToast('Choisissez un pack', 'error'); return; }
    const currentBalance = Number(wallet?.balance || 0);
    const cost = selectedPack.price_mad || 0;
    if (currentBalance < cost) { showToast('Solde insuffisant — rechargez votre wallet', 'error'); return; }
    const sb = getSupabase();
    const expiresAt = new Date(Date.now() + (selectedPack.duration_days || 7) * 86400000).toISOString();
    await sb.from('boosts').insert({ user_id: seller.id, shop_id: shop?.id, product_id: target?.product_id || null, pack_id: selectedPack.id, type: target?.type || 'shop', status: 'active', started_at: new Date().toISOString(), expires_at: expiresAt, amount_paid: cost, currency: 'MAD' });
    await sb.from('vendor_wallets').update({ balance: currentBalance - cost, updated_at: new Date().toISOString() }).eq('user_id', seller.id);
    await sb.from('wallet_transactions').insert({ user_id: seller.id, type: 'boost_purchase', amount: -cost, currency: 'MAD', description: `Boost ${selectedPack.name}`, status: 'completed' });
    setWallet((prev) => ({ ...prev, balance: currentBalance - cost }));
    showToast('Boost activé !', 'success');
    setRechargeOpen(false);
    setSelectedPack(null);
    await loadWalletSection(sb);
  }

  // ── REVIEWS ──
  async function loadReviews(sb) {
    const { data: myProds } = await sb.from('products').select('id').eq('seller_id', seller.id);
    const ids = (myProds || []).map((p) => p.id);
    if (!ids.length) { setReviews([]); return; }
    let q = sb.from('reviews').select('*, products(name)').in('product_id', ids).order('created_at', { ascending: false });
    if (reviewFilter) q = q.eq('status', reviewFilter);
    const { data } = await q;
    setReviews(data || []);
    const { data: allRevs } = await sb.from('reviews').select('rating,status').in('product_id', ids);
    const approved = (allRevs || []).filter((r) => r.status === 'approved');
    setReviewStats({
      avg: approved.length ? (approved.reduce((s, r) => s + r.rating, 0) / approved.length).toFixed(1) : 0,
      total: (allRevs || []).length, approved: approved.length,
    });
  }

  // ── SHOP ──
  async function uploadShopImg(file, field) {
    if (!file) return;
    const sb = getSupabase();
    const path = `shops/${seller.id}/${field}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '')}`;
    const { error } = await sb.storage.from('products').upload(path, file, { upsert: true });
    if (error) { showToast('Erreur upload', 'error'); return; }
    const { data } = sb.storage.from('products').getPublicUrl(path);
    setShopForm((prev) => ({ ...prev, [field === 'logo' ? 'logo_url' : 'banner_url']: data.publicUrl }));
  }

  async function saveShop(e) {
    e.preventDefault();
    if (!shopForm.name) { showToast('Le nom de la boutique est requis', 'error'); return; }
    const sb = getSupabase();
    const payload = { ...shopForm, user_id: seller.id };
    let error;
    if (shop?.id) ({ error } = await sb.from('shops').update(payload).eq('id', shop.id));
    else ({ error } = await sb.from('shops').insert(payload));
    if (error) { showToast('Erreur : ' + error.message, 'error'); return; }
    showToast('Boutique enregistrée', 'success');
    const { data: refreshed } = await sb.from('shops').select('*').eq('user_id', seller.id).maybeSingle();
    setShop(refreshed);
  }

  // ── PROFILE ──
  async function saveProfile(e) {
    e.preventDefault();
    const sb = getSupabase();
    const full_name = `${profileForm.first_name} ${profileForm.last_name}`.trim();
    const { error } = await sb.from('users').update({ first_name: profileForm.first_name, last_name: profileForm.last_name, full_name, specialty: profileForm.specialty, country: profileForm.country, updated_at: new Date().toISOString() }).eq('id', seller.id);
    if (error) { showToast('Erreur : ' + error.message, 'error'); return; }
    showToast('Profil mis à jour', 'success');
    setSeller((prev) => ({ ...prev, ...profileForm, full_name }));
  }

  async function resetPassword() {
    const sb = getSupabase();
    const { error } = await sb.auth.resetPasswordForEmail(seller.email);
    showToast(error ? 'Erreur : ' + error.message : 'Email de réinitialisation envoyé', error ? 'error' : 'success');
  }

  async function confirmDeleteAccount() {
    const sb = getSupabase();
    await sb.from('users').update({ status: 'deletion_requested' }).eq('id', seller.id);
    await sb.auth.signOut();
    router.push('/connexion');
  }

  function showSection(s) { setSection(s); setSidebarOpen(false); }

  if (checking) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-faint)', minHeight: '100vh' }}>Vérification du compte…</div>;

  const maxChart = Math.max(1, ...chartData.map((m) => m.total));

  return (
    <div className={styles.wrap}>
      {sidebarOpen && <div className={styles.sidebarOverlay} onClick={() => setSidebarOpen(false)} />}

      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.logo}><span>Wenna</span>Shop</div>
        <div className={styles.sellerBox}>
          <div className={styles.sellerAv}>{(seller.full_name || seller.email || '?').charAt(0).toUpperCase()}</div>
          <div>
            <div className={styles.sellerName}>{seller.full_name || seller.email}</div>
            <div className={styles.sellerCountry}>{seller.country || '—'}</div>
          </div>
        </div>
        <div className={styles.walletMini}>
          <div>
            <div className={styles.walletMiniLabel}>Crédits Boost</div>
            <div className={styles.walletMiniAmount}>{fmt(wallet?.balance, wallet?.currency)}</div>
          </div>
          <button className={styles.linkBtn} onClick={() => showSection('wallet')}><i className="ph ph-arrow-right" /></button>
        </div>
        {[
          ['overview', 'ph-squares-four', "Vue d'ensemble"],
          ['products', 'ph-package', 'Mes produits'],
          ['orders', 'ph-shopping-bag', 'Commandes'],
          ['revenue', 'ph-currency-circle-dollar', 'Revenus'],
          ['wallet', 'ph-wallet', 'Wallet & Boosts'],
          ['reviews', 'ph-star', 'Avis clients'],
          ['shop', 'ph-storefront', 'Ma boutique'],
          ['profile', 'ph-user', 'Mon profil'],
        ].map(([key, icon, label]) => (
          <button key={key} className={`${styles.navItem} ${section === key ? styles.navItemActive : ''}`} onClick={() => showSection(key)}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><i className={`ph ${icon}`} />{label}</span>
            {key === 'orders' && orders.filter((o) => o.status === 'pending').length > 0 && <span className={styles.navBadge}>{orders.filter((o) => o.status === 'pending').length}</span>}
          </button>
        ))}
        <button className={styles.logoutBtn} onClick={async () => { await getSupabase().auth.signOut(); router.push('/connexion'); }}><i className="ph ph-sign-out" /> Déconnexion</button>
      </aside>

      <main className={styles.main}>
        <div className={styles.topRow}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setSidebarOpen(true)} className={styles.mobileMenuBtn}><i className="ph ph-list" /></button>
            <h1 className={styles.pageTitle}>
              {{ overview: "Vue d'ensemble", products: 'Mes produits', orders: 'Commandes', revenue: 'Revenus', wallet: 'Wallet & Boosts', reviews: 'Avis clients', shop: 'Ma boutique', profile: 'Mon profil' }[section]}
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className={styles.notifBtn} onClick={() => setNotifPanelOpen(true)}>
              <i className="ph ph-bell" />
              {unreadCount > 0 && <span className={styles.notifDot}>{unreadCount}</span>}
            </button>
            <button className={styles.btnPrimary} onClick={() => { showSection('products'); openProductModal(); }}><i className="ph ph-plus" /> Nouveau produit</button>
          </div>
        </div>

        {/* ─────────── OVERVIEW ─────────── */}
        {section === 'overview' && (
          <>
            <div className={styles.card} style={{ padding: '12px 18px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12, background: 'var(--accent-light)', border: '1px solid var(--border-accent)' }}>
              <i className="ph ph-percent" style={{ fontSize: 20, color: 'var(--accent)' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Commission WennaShop : <strong style={{ color: 'var(--text)' }}>{shop?.commission_rate || 8}%</strong> par vente.</span>
            </div>

            {openQuests.count > 0 && (
              <div className={styles.card} onClick={() => router.push('/quetes')} style={{ padding: '14px 18px', marginBottom: 14, cursor: 'pointer', background: 'var(--gold-light)', border: '1px solid rgba(245,158,11,.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <i className="ph ph-shooting-star" style={{ fontSize: 20, color: 'var(--gold)' }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--gold)' }}>Quêtes ouvertes</div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>Des acheteurs cherchent des produits</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 18 }}>
                  <div style={{ textAlign: 'center' }}><div style={{ fontSize: 18, fontWeight: 900, color: 'var(--gold)' }}>{openQuests.count}</div><div style={{ fontSize: 9, color: 'var(--text-faint)' }}>OUVERTES</div></div>
                  <div style={{ textAlign: 'center' }}><div style={{ fontSize: 18, fontWeight: 900, color: 'var(--gold)' }}>{Math.round(openQuests.reward).toLocaleString('fr-FR')}</div><div style={{ fontSize: 9, color: 'var(--text-faint)' }}>RÉCOMP.</div></div>
                </div>
              </div>
            )}

            <div className={styles.statGrid}>
              <div className={styles.statCard}><div className={styles.statNum} style={{ color: 'var(--accent)' }}>{overview.products}</div><div className={styles.statLabel}>Produits actifs</div></div>
              <div className={styles.statCard}><div className={styles.statNum}>{overview.orders}</div><div className={styles.statLabel}>Commandes</div></div>
              <div className={styles.statCard}><div className={styles.statNum} style={{ color: 'var(--gold)' }}>{fmt(overview.revenue)}</div><div className={styles.statLabel}>Revenus livrés</div></div>
              <div className={styles.statCard}><div className={styles.statNum} style={{ color: 'var(--success)' }}>{overview.rating}</div><div className={styles.statLabel}>Note / 5</div></div>
            </div>

            <div className={styles.card} style={{ marginBottom: 14 }}>
              <div className={styles.cardHead}><div className={styles.cardTitle}>Revenus — 6 derniers mois</div></div>
              <div style={{ padding: 18 }}>
                <svg viewBox="0 0 300 140" style={{ width: '100%', height: 140 }}>
                  {chartData.map((m, i) => {
                    const h = (m.total / maxChart) * 100;
                    const x = i * 50 + 8;
                    return (
                      <g key={m.key}>
                        <rect x={x} y={120 - h} width="30" height={h} rx="4" fill="var(--accent)" opacity="0.85" />
                        <text x={x + 15} y="134" textAnchor="middle" fontSize="9" fill="var(--text-faint)">{m.label}</text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>

            <div className={styles.twoCol}>
              <div className={styles.card}>
                <div className={styles.cardHead}><div className={styles.cardTitle}>Commandes récentes</div><button className={styles.linkBtn} onClick={() => showSection('orders')}>Voir tout</button></div>
                {recentOrders.length === 0 ? <div className={styles.empty}>Aucune commande pour l'instant.</div> : recentOrders.map((o) => (
                  <div key={o.id} className={styles.orderRow}>
                    <div>
                      <div style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700 }}>#{o.id.slice(0, 8).toUpperCase()}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>{fmtDate(o.created_at)}</div>
                    </div>
                    <span className={styles.badge} style={{ background: `${STATUS_COLOR[o.status]}22`, color: STATUS_COLOR[o.status] }}>{STATUS_LABEL[o.status] || o.status}</span>
                  </div>
                ))}
              </div>
              <div className={styles.card}>
                <div className={styles.cardHead}><div className={styles.cardTitle}>Stock faible</div><span style={{ fontSize: 10, fontWeight: 700, color: 'var(--error)' }}>Urgent</span></div>
                {lowStock.length === 0 ? <div className={styles.empty}>Tout va bien ✓</div> : lowStock.map((p) => (
                  <div key={p.id} className={styles.orderRow}>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{p.name}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--error)' }}>{p.stock} restant{p.stock > 1 ? 's' : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ─────────── PRODUCTS ─────────── */}
        {section === 'products' && (
          <>
            <div className={styles.topRow}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input className={styles.input} style={{ width: 220 }} placeholder="Rechercher…" value={prodSearch} onChange={(e) => setProdSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && loadProducts(getSupabase())} />
                <select className={styles.input} style={{ width: 170 }} value={prodStatus} onChange={(e) => { setProdStatus(e.target.value); setProdPage(1); }}>
                  <option value="">Tous les statuts</option>
                  <option value="active">Actif</option>
                  <option value="pending">En attente</option>
                  <option value="inactive">Inactif</option>
                </select>
              </div>
              <button className={styles.btnPrimary} onClick={() => openProductModal()}><i className="ph ph-plus" /> Nouveau</button>
            </div>
            <div className={styles.card}>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>Produit</th><th>Prix</th><th>Stock</th><th>Statut</th><th></th></tr></thead>
                  <tbody>
                    {products.length === 0 ? (
                      <tr><td colSpan={5} className={styles.empty}>Aucun produit</td></tr>
                    ) : products.map((p) => (
                      <tr key={p.id}>
                        <td style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {p.image_url ? <img src={p.image_url} alt="" style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 6 }} /> : <div style={{ width: 34, height: 34, background: 'var(--surface-2)', borderRadius: 6 }} />}
                          {p.name}
                        </td>
                        <td style={{ color: 'var(--accent)', fontWeight: 700 }}>{fmt(p.price)}</td>
                        <td>{p.stock}</td>
                        <td><span className={styles.badge} style={{ background: `${STATUS_COLOR[p.status]}22`, color: STATUS_COLOR[p.status] }}>{STATUS_LABEL[p.status] || p.status}</span></td>
                        <td style={{ display: 'flex', gap: 10 }}>
                          <button className={styles.linkBtn} onClick={() => openProductModal(p)}>Modifier</button>
                          <button className={styles.btnDanger} onClick={() => setDeleteTarget(p.id)}>Suppr.</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {prodTotal > PAGE_SIZE && (
                <div className={styles.pagination}>
                  <span className={styles.pageInfo}>{prodTotal} produit{prodTotal > 1 ? 's' : ''}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className={styles.pageBtn} disabled={prodPage === 1} onClick={() => setProdPage((p) => p - 1)}>Précédent</button>
                    <button className={styles.pageBtn} disabled={prodPage * PAGE_SIZE >= prodTotal} onClick={() => setProdPage((p) => p + 1)}>Suivant</button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ─────────── ORDERS ─────────── */}
        {section === 'orders' && (
          <>
            <div className={styles.topRow}>
              <select className={styles.input} style={{ width: 200 }} value={orderStatus} onChange={(e) => setOrderStatus(e.target.value)}>
                <option value="">Tous les statuts</option>
                <option value="pending">En attente</option>
                <option value="processing">En traitement</option>
                <option value="shipped">Expédiée</option>
                <option value="delivered">Livrée</option>
                <option value="cancelled">Annulée</option>
              </select>
            </div>
            <div className={styles.card}>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>Réf.</th><th>Client</th><th>Montant</th><th>Statut</th><th>Suivi</th><th></th></tr></thead>
                  <tbody>
                    {orders.length === 0 ? (
                      <tr><td colSpan={6} className={styles.empty}>Aucune commande</td></tr>
                    ) : orders.map((o) => (
                      <tr key={o.id}>
                        <td style={{ fontFamily: 'monospace' }}>#{o.id.slice(0, 8).toUpperCase()}</td>
                        <td>{o.shipping_name || '—'}</td>
                        <td style={{ color: 'var(--accent)', fontWeight: 700 }}>{fmt(o.total_amount, o.currency)}</td>
                        <td><span className={styles.badge} style={{ background: `${STATUS_COLOR[o.status]}22`, color: STATUS_COLOR[o.status] }}>{STATUS_LABEL[o.status] || o.status}</span></td>
                        <td>{o.tracking_number ? <span style={{ fontFamily: 'monospace', fontSize: 10 }}>{o.tracking_number}</span> : '—'}</td>
                        <td><button className={styles.linkBtn} onClick={() => openOrderModal(o)}>Détail</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ─────────── REVENUE ─────────── */}
        {section === 'revenue' && (
          <>
            <div className={styles.statGrid}>
              <div className={styles.statCard}><div className={styles.statLabel} style={{ marginBottom: 6 }}>Total encaissé</div><div className={styles.statNum} style={{ fontSize: 20 }}>{fmt(revenue.total)}</div></div>
              <div className={styles.statCard}><div className={styles.statLabel} style={{ marginBottom: 6 }}>Ce mois</div><div className={styles.statNum} style={{ fontSize: 20 }}>{fmt(revenue.month)}</div></div>
              <div className={styles.statCard}><div className={styles.statLabel} style={{ marginBottom: 6 }}>Commissions</div><div className={styles.statNum} style={{ fontSize: 20, color: 'var(--error)' }}>-{fmt(revenue.commission)}</div></div>
              <div className={styles.statCard}><div className={styles.statLabel} style={{ marginBottom: 6 }}>Panier moyen</div><div className={styles.statNum} style={{ fontSize: 20 }}>{fmt(revenue.avg)}</div></div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardHead}><div className={styles.cardTitle}>Historique paiements</div></div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>Réf.</th><th>Brut</th><th>Comm.</th><th>Net</th><th>Date</th><th>Statut</th></tr></thead>
                  <tbody>
                    {payments.length === 0 ? (
                      <tr><td colSpan={6} className={styles.empty}>Aucun paiement</td></tr>
                    ) : payments.map((p) => (
                      <tr key={p.id}>
                        <td style={{ fontFamily: 'monospace' }}>#{p.order_id.slice(0, 8).toUpperCase()}</td>
                        <td>{fmt(p.amount, p.currency)}</td>
                        <td style={{ color: 'var(--error)' }}>-{fmt(p.commission, p.currency)}</td>
                        <td style={{ color: 'var(--success)', fontWeight: 700 }}>{fmt(p.net, p.currency)}</td>
                        <td style={{ fontSize: 11, color: 'var(--text-faint)' }}>{fmtDate(p.created_at)}</td>
                        <td><span className={styles.badge} style={{ background: `${STATUS_COLOR[p.status] || '#555'}22`, color: STATUS_COLOR[p.status] || 'var(--text-muted)' }}>{STATUS_LABEL[p.status] || p.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ─────────── WALLET ─────────── */}
        {section === 'wallet' && (
          <>
            <div className={styles.walletCard}>
              <div className={styles.walletLabel}>Solde Crédits Boost</div>
              <div className={styles.walletAmount}>{fmt(wallet?.balance, wallet?.currency)}</div>
              <button className={styles.btnPrimary} style={{ marginTop: 14 }} onClick={() => setRechargeOpen(true)}><i className="ph ph-plus-circle" /> Recharger / Activer un boost</button>
            </div>
            <div className={styles.card}>
              <div className={styles.cardHead}><div className={styles.cardTitle}>Boosts</div></div>
              {boosts.length === 0 ? <div className={styles.empty}>Aucun boost actif.</div> : boosts.map((b) => (
                <div key={b.id} className={styles.boostRow}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{b.boost_packs?.name || b.type}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>{b.status === 'active' ? `Expire le ${fmtDate(b.expires_at)}` : STATUS_LABEL[b.status] || b.status}</div>
                  </div>
                  <span className={styles.badge} style={{ background: b.status === 'active' ? 'rgba(34,197,94,.12)' : 'rgba(85,85,85,.2)', color: b.status === 'active' ? 'var(--success)' : 'var(--text-faint)' }}>{STATUS_LABEL[b.status] || b.status}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ─────────── REVIEWS ─────────── */}
        {section === 'reviews' && (
          <>
            <div className={styles.statGrid}>
              <div className={styles.statCard} style={{ textAlign: 'center' }}><div style={{ fontSize: 32, fontWeight: 900, color: 'var(--accent)' }}>{reviewStats.avg || '—'}</div><div className={styles.statLabel}>Note moyenne</div></div>
              <div className={styles.statCard} style={{ textAlign: 'center' }}><div className={styles.statNum}>{reviewStats.total}</div><div className={styles.statLabel}>Total avis</div></div>
              <div className={styles.statCard} style={{ textAlign: 'center' }}><div className={styles.statNum}>{reviewStats.approved}</div><div className={styles.statLabel}>Approuvés</div></div>
              <div className={styles.statCard} style={{ display: 'flex', alignItems: 'center' }}>
                <select className={styles.input} value={reviewFilter} onChange={(e) => setReviewFilter(e.target.value)}>
                  <option value="">Tous</option>
                  <option value="approved">Approuvés</option>
                  <option value="pending">En attente</option>
                </select>
              </div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardHead}><div className={styles.cardTitle}>Avis reçus</div></div>
              {reviews.length === 0 ? <div className={styles.empty}>Aucun avis pour l'instant.</div> : reviews.map((r) => (
                <div key={r.id} className={styles.orderRow} style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                    <div><strong style={{ fontSize: 12 }}>{r.reviewer_name || 'Anonyme'}</strong> <span style={{ color: 'var(--gold)', fontSize: 11 }}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span></div>
                    <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{fmtDate(r.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>{r.products?.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.comment}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ─────────── SHOP ─────────── */}
        {section === 'shop' && (
          <form className={styles.card} onSubmit={saveShop} style={{ maxWidth: 640, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className={styles.formGrid}>
              <div className={styles.formGroup}><label className={styles.formLabel}>Nom de la boutique *</label><input className={styles.input} value={shopForm.name} onChange={(e) => setShopForm({ ...shopForm, name: e.target.value })} /></div>
              <div className={styles.formGroup}><label className={styles.formLabel}>Slug (URL)</label><input className={styles.input} value={shopForm.slug} onChange={(e) => setShopForm({ ...shopForm, slug: e.target.value })} /></div>
            </div>
            <div className={styles.formGroup}><label className={styles.formLabel}>Description / Bio</label><textarea className={styles.input} rows={3} value={shopForm.bio} onChange={(e) => setShopForm({ ...shopForm, bio: e.target.value })} /></div>
            <div className={styles.formGrid}>
              <div className={styles.formGroup}><label className={styles.formLabel}>Ville</label><input className={styles.input} value={shopForm.city} onChange={(e) => setShopForm({ ...shopForm, city: e.target.value })} /></div>
              <div className={styles.formGroup}><label className={styles.formLabel}>Pays</label>
                <select className={styles.input} value={shopForm.country} onChange={(e) => setShopForm({ ...shopForm, country: e.target.value })}>
                  {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Logo</label>
              {shopForm.logo_url && <img src={shopForm.logo_url} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 12, marginBottom: 6 }} />}
              <input type="file" accept="image/*" onChange={(e) => uploadShopImg(e.target.files[0], 'logo')} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Bannière</label>
              {shopForm.banner_url && <img src={shopForm.banner_url} alt="" style={{ width: '100%', height: 90, objectFit: 'cover', borderRadius: 12, marginBottom: 6 }} />}
              <input type="file" accept="image/*" onChange={(e) => uploadShopImg(e.target.files[0], 'banner')} />
            </div>
            <div className={styles.formGrid}>
              <div className={styles.formGroup}><label className={styles.formLabel}>WhatsApp</label><input className={styles.input} value={shopForm.whatsapp} onChange={(e) => setShopForm({ ...shopForm, whatsapp: e.target.value })} /></div>
              <div className={styles.formGroup}><label className={styles.formLabel}>Instagram</label><input className={styles.input} value={shopForm.instagram} onChange={(e) => setShopForm({ ...shopForm, instagram: e.target.value })} /></div>
              <div className={styles.formGroup}><label className={styles.formLabel}>Facebook</label><input className={styles.input} value={shopForm.facebook} onChange={(e) => setShopForm({ ...shopForm, facebook: e.target.value })} /></div>
              <div className={styles.formGroup}><label className={styles.formLabel}>TikTok</label><input className={styles.input} value={shopForm.tiktok} onChange={(e) => setShopForm({ ...shopForm, tiktok: e.target.value })} /></div>
            </div>
            <div className={styles.formGroup}><label className={styles.formLabel}>Politique (retours, délais…)</label><textarea className={styles.input} rows={3} value={shopForm.shop_policies} onChange={(e) => setShopForm({ ...shopForm, shop_policies: e.target.value })} /></div>
            <button type="submit" className={styles.btnPrimary} style={{ alignSelf: 'flex-start' }}><i className="ph ph-floppy-disk" /> Enregistrer</button>
          </form>
        )}

        {/* ─────────── PROFILE ─────────── */}
        {section === 'profile' && (
          <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <form className={styles.card} onSubmit={saveProfile} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className={styles.formGrid}>
                <div className={styles.formGroup}><label className={styles.formLabel}>Prénom</label><input className={styles.input} value={profileForm.first_name} onChange={(e) => setProfileForm({ ...profileForm, first_name: e.target.value })} /></div>
                <div className={styles.formGroup}><label className={styles.formLabel}>Nom</label><input className={styles.input} value={profileForm.last_name} onChange={(e) => setProfileForm({ ...profileForm, last_name: e.target.value })} /></div>
              </div>
              <div className={styles.formGroup}><label className={styles.formLabel}>Spécialité / Boutique</label><input className={styles.input} value={profileForm.specialty} onChange={(e) => setProfileForm({ ...profileForm, specialty: e.target.value })} placeholder="ex: Huiles naturelles · Casablanca" /></div>
              <div className={styles.formGroup}><label className={styles.formLabel}>Pays</label>
                <select className={styles.input} value={profileForm.country} onChange={(e) => setProfileForm({ ...profileForm, country: e.target.value })}>
                  {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <button type="submit" className={styles.btnPrimary} style={{ alignSelf: 'flex-start' }}><i className="ph ph-floppy-disk" /> Enregistrer</button>
            </form>
            <div className={styles.card} style={{ padding: 16 }}>
              <div className={styles.cardTitle} style={{ marginBottom: 10 }}>Sécurité</div>
              <button className={styles.btnGhost} onClick={resetPassword}><i className="ph ph-lock-key" /> Réinitialiser le mot de passe</button>
            </div>
            <div className={styles.card} style={{ padding: 16 }}>
              <div className={styles.cardTitle} style={{ color: 'var(--error)', marginBottom: 10 }}>Zone de danger</div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>La suppression de votre compte est <strong style={{ color: 'var(--error)' }}>irréversible</strong>.</p>
              <button className={styles.btnDanger} onClick={() => setDeleteAccountOpen(true)}>Supprimer mon compte</button>
            </div>
          </div>
        )}
      </main>

      {/* ── NOTIF PANEL ── */}
      {notifPanelOpen && (
        <>
          <div className={styles.sidebarOverlay} onClick={() => setNotifPanelOpen(false)} />
          <aside className={styles.notifPanelFull}>
            <div className={styles.modalHead}>
              <span><i className="ph ph-bell" /> Notifications</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className={styles.linkBtn} onClick={markAllRead}>Tout lire</button>
                <button className={styles.modalClose} onClick={() => setNotifPanelOpen(false)}><i className="ph ph-x" /></button>
              </div>
            </div>
            <div className={styles.tabs} style={{ padding: '10px 16px 0' }}>
              {['all', 'order', 'review', 'stock'].map((t) => (
                <button key={t} className={`${styles.tabBtn} ${notifTab === t ? styles.tabBtnActive : ''}`} onClick={() => setNotifTab(t)}>{{ all: 'Toutes', order: 'Commandes', review: 'Avis', stock: 'Stock' }[t]}</button>
              ))}
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {filteredNotifs.length === 0 ? <div className={styles.empty}>Aucune notification.</div> : filteredNotifs.map((n) => (
                <div key={n.id} className={styles.notifItem} style={{ cursor: 'pointer', background: n.is_read ? 'transparent' : 'rgba(255,117,31,.05)' }} onClick={() => openNotif(n)}>
                  <div className={styles.notifTitle}><i className={`ph ${NOTIF_ICON[n.type] || 'ph-bell'}`} style={{ marginRight: 6, color: 'var(--accent)' }} />{n.title}</div>
                  <div className={styles.notifBody}>{n.body}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 4 }}>{timeAgo(n.created_at)}</div>
                </div>
              ))}
            </div>
          </aside>
        </>
      )}

      {/* ── PUSH TOAST ── */}
      {pushToast && (
        <div className={styles.pushToastBox}>
          <i className={`ph ${NOTIF_ICON[pushToast.type] || 'ph-bell'}`} style={{ fontSize: 18, color: 'var(--accent)' }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 800 }}>{pushToast.title}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{pushToast.body}</div>
          </div>
          <button onClick={() => setPushToast(null)} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer' }}><i className="ph ph-x" /></button>
        </div>
      )}

      {/* ── TOAST ── */}
      {toast && <div className={`${styles.toast} ${toast.type === 'error' ? styles.toastError : ''}`}>{toast.msg}</div>}

      {/* ── MODAL PRODUIT ── */}
      {productModalOpen && (
        <div className={styles.modalOv} onClick={() => setProductModalOpen(false)}>
          <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <span>{productForm.id ? 'Modifier le produit' : 'Nouveau produit'}</span>
              <button className={styles.modalClose} onClick={() => setProductModalOpen(false)}><i className="ph ph-x" /></button>
            </div>
            <div className={styles.tabs} style={{ padding: '12px 20px 0' }}>
              <button className={`${styles.tabBtn} ${productTab === 'info' ? styles.tabBtnActive : ''}`} onClick={() => setProductTab('info')}>Infos</button>
              <button className={`${styles.tabBtn} ${productTab === 'photos' ? styles.tabBtnActive : ''}`} onClick={() => setProductTab('photos')}>Photos</button>
              <button className={`${styles.tabBtn} ${productTab === 'carac' ? styles.tabBtnActive : ''}`} onClick={() => setProductTab('carac')}>Caractéristiques</button>
            </div>
            <div className={styles.modalBody}>
              {productTab === 'info' && (
                <>
                  <div className={styles.formGroup}><label className={styles.formLabel}>Nom du produit *</label><input className={styles.input} value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} /></div>
                  <div className={styles.formGroup}><label className={styles.formLabel}>Description</label><textarea className={styles.input} rows={3} value={productForm.description} onChange={(e) => setProductForm({ ...productForm, description: e.target.value })} /></div>
                  <div className={styles.formGrid}>
                    <div className={styles.formGroup}><label className={styles.formLabel}>Prix (MAD) *</label><input type="number" className={styles.input} value={productForm.price} onChange={(e) => setProductForm({ ...productForm, price: e.target.value })} /></div>
                    <div className={styles.formGroup}><label className={styles.formLabel}>Stock *</label><input type="number" className={styles.input} value={productForm.stock} onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })} /></div>
                  </div>
                  <div className={styles.formGrid}>
                    <div className={styles.formGroup}><label className={styles.formLabel}>Pays *</label>
                      <select className={styles.input} value={productForm.country} onChange={(e) => setProductForm({ ...productForm, country: e.target.value })}>
                        {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className={styles.formGroup}><label className={styles.formLabel}>Ville d'origine</label><input className={styles.input} value={productForm.origin_city} onChange={(e) => setProductForm({ ...productForm, origin_city: e.target.value })} /></div>
                  </div>
                  <div className={styles.formGrid}>
                    <div className={styles.formGroup}><label className={styles.formLabel}>Catégorie</label>
                      <select className={styles.input} value={productForm.category_id} onChange={(e) => setProductForm({ ...productForm, category_id: e.target.value })}>
                        <option value="">Sélectionner…</option>
                        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div className={styles.formGroup}><label className={styles.formLabel}>Statut</label>
                      <select className={styles.input} value={productForm.status} onChange={(e) => setProductForm({ ...productForm, status: e.target.value })}>
                        <option value="pending">En attente de validation</option>
                        <option value="active">Actif</option>
                        <option value="inactive">Inactif</option>
                      </select>
                    </div>
                  </div>
                  <div className={styles.formGrid}>
                    <div className={styles.formGroup}><label className={styles.formLabel}>Marque</label><input className={styles.input} value={productForm.brand} onChange={(e) => setProductForm({ ...productForm, brand: e.target.value })} /></div>
                    <div className={styles.formGroup}><label className={styles.formLabel}>SKU</label><input className={styles.input} value={productForm.sku} onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })} /></div>
                  </div>
                  <div className={styles.formGrid}>
                    <div className={styles.formGroup}><label className={styles.formLabel}>Prix barré (MAD)</label><input type="number" className={styles.input} value={productForm.compare_price} onChange={(e) => setProductForm({ ...productForm, compare_price: e.target.value })} /></div>
                    <div className={styles.formGroup}><label className={styles.formLabel}>Livraison (jours)</label><input type="number" className={styles.input} value={productForm.delivery_days} onChange={(e) => setProductForm({ ...productForm, delivery_days: e.target.value })} /></div>
                  </div>
                </>
              )}

              {productTab === 'photos' && (
                <>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>La 1ère photo est l'image principale.</p>
                  <div className={styles.imgGrid}>
                    {productImages.map((url, i) => (
                      <div key={i} className={styles.imgSlot} style={{ borderStyle: 'solid' }}>
                        <img src={url} alt="" />
                        <button className={styles.imgDel} onClick={() => removeImg(i)}><i className="ph ph-x" /></button>
                      </div>
                    ))}
                    <label className={styles.imgSlot}>
                      {uploading ? '…' : <><i className="ph ph-upload-simple" style={{ fontSize: 20 }} /><span style={{ fontSize: 9 }}>Ajouter</span></>}
                      <input type="file" accept="image/*" multiple onChange={(e) => handleProductFiles(e.target.files)} />
                    </label>
                  </div>
                  <div className={styles.formGroup} style={{ marginTop: 12 }}>
                    <label className={styles.formLabel}>Ou URL image</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input id="img-url-inp" className={styles.input} placeholder="https://…" />
                      <button className={styles.btnGhost} onClick={() => { const el = document.getElementById('img-url-inp'); addImgFromUrl(el.value); el.value = ''; }}>Ajouter</button>
                    </div>
                  </div>
                </>
              )}

              {productTab === 'carac' && (
                <>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>Clé / valeur : matière, taille, couleur…</p>
                  {caracs.map((c, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 7, marginBottom: 7 }}>
                      <input className={styles.input} placeholder="Clé" value={c.k} onChange={(e) => updateCarac(i, 'k', e.target.value)} />
                      <input className={styles.input} placeholder="Valeur" value={c.v} onChange={(e) => updateCarac(i, 'v', e.target.value)} />
                      <button className={styles.btnDanger} onClick={() => removeCarac(i)}><i className="ph ph-trash" /></button>
                    </div>
                  ))}
                  <button className={styles.btnGhost} onClick={addCarac} style={{ width: '100%', justifyContent: 'center' }}><i className="ph ph-plus" /> Ajouter</button>
                  <div style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 16 }}>
                    <div className={styles.formGrid} style={{ marginBottom: 10 }}>
                      <div className={styles.formGroup}><label className={styles.formLabel}>Matière</label><input className={styles.input} value={productForm.material} onChange={(e) => setProductForm({ ...productForm, material: e.target.value })} /></div>
                      <div className={styles.formGroup}><label className={styles.formLabel}>Couleur</label><input className={styles.input} value={productForm.color} onChange={(e) => setProductForm({ ...productForm, color: e.target.value })} /></div>
                    </div>
                    <div className={styles.formGrid}>
                      <div className={styles.formGroup}><label className={styles.formLabel}>Poids</label><input className={styles.input} placeholder="250g" value={productForm.weight} onChange={(e) => setProductForm({ ...productForm, weight: e.target.value })} /></div>
                      <div className={styles.formGroup}><label className={styles.formLabel}>Dimensions</label><input className={styles.input} placeholder="30×20cm" value={productForm.dimensions} onChange={(e) => setProductForm({ ...productForm, dimensions: e.target.value })} /></div>
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btnGhost} style={{ flex: 1, justifyContent: 'center' }} onClick={() => setProductModalOpen(false)}>Annuler</button>
              <button className={styles.btnPrimary} style={{ flex: 1, justifyContent: 'center' }} onClick={saveProduct}>{productForm.id ? 'Mettre à jour' : 'Créer'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL SUPPRESSION PRODUIT ── */}
      {deleteTarget && (
        <div className={styles.modalOv} onClick={() => setDeleteTarget(null)}>
          <div className={styles.modalBox} style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: 24, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <i className="ph ph-trash" style={{ fontSize: 28, color: 'var(--error)' }} />
              <h3 style={{ fontSize: 16, fontWeight: 900 }}>Supprimer ce produit ?</h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Cette action est irréversible.</p>
              <div style={{ display: 'flex', gap: 10, width: '100%' }}>
                <button className={styles.btnGhost} style={{ flex: 1, justifyContent: 'center' }} onClick={() => setDeleteTarget(null)}>Annuler</button>
                <button className={styles.btnDanger} style={{ flex: 1, justifyContent: 'center' }} onClick={confirmDeleteProduct}>Supprimer</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL COMMANDE ── */}
      {orderModal && (
        <div className={styles.modalOv} onClick={() => setOrderModal(null)}>
          <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <span>Détail commande #{orderModal.id.slice(0, 8).toUpperCase()}</span>
              <button className={styles.modalClose} onClick={() => setOrderModal(null)}><i className="ph ph-x" /></button>
            </div>
            <div className={styles.modalBody}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className={styles.badge} style={{ background: `${STATUS_COLOR[orderModal.status]}22`, color: STATUS_COLOR[orderModal.status] }}>{STATUS_LABEL[orderModal.status] || orderModal.status}</span>
                <strong>{fmt(orderModal.total_amount, orderModal.currency)}</strong>
              </div>
              {orderItemsDetail.map((it, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <span>{it.products?.name} × {it.quantity}</span>
                  <span style={{ fontWeight: 700 }}>{fmt(it.unit_price * it.quantity)}</span>
                </div>
              ))}
              <div>
                <label className={styles.formLabel} style={{ display: 'block', marginBottom: 8 }}>Mettre à jour le statut</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select className={styles.input} style={{ flex: 1 }} value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
                    {['pending', 'processing', 'shipped', 'delivered', 'cancelled'].map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                  <button className={styles.btnPrimary} onClick={updateOrderStatus}>Mettre à jour</button>
                </div>
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <label className={styles.formLabel} style={{ display: 'block', marginBottom: 8, color: 'var(--success)' }}><i className="ph ph-package" /> Expédier</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input className={styles.input} placeholder="N° suivi · WNS-20240501-ABCD" value={shipTracking} onChange={(e) => setShipTracking(e.target.value)} />
                  <input type="date" className={styles.input} value={shipEta} onChange={(e) => setShipEta(e.target.value)} title="Livraison estimée" />
                  <button className={styles.btnPrimary} style={{ justifyContent: 'center' }} onClick={shipOrder}><i className="ph ph-paper-plane-tilt" /> Expédier</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL RECHARGE / BOOST ── */}
      {rechargeOpen && (
        <div className={styles.modalOv} onClick={() => setRechargeOpen(false)}>
          <div className={styles.modalBox} style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <span>Recharger / Activer un boost</span>
              <button className={styles.modalClose} onClick={() => setRechargeOpen(false)}><i className="ph ph-x" /></button>
            </div>
            <div className={styles.modalBody}>
              {boostPacks.length === 0 ? <div className={styles.empty}>Aucun pack disponible.</div> : boostPacks.map((pack) => (
                <button key={pack.id} onClick={() => setSelectedPack(pack)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', textAlign: 'left', padding: 14, borderRadius: 12, border: selectedPack?.id === pack.id ? '1.5px solid var(--accent)' : '1.5px solid var(--border)', background: selectedPack?.id === pack.id ? 'var(--accent-light)' : 'var(--surface-2)', cursor: 'pointer', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800 }}>{pack.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{pack.duration_days} jours · {pack.description}</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--accent)' }}>{fmt(pack.price_mad)}</div>
                </button>
              ))}
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btnGhost} style={{ flex: 1, justifyContent: 'center' }} onClick={() => activateBoost({ type: 'shop' })}>Activer avec mon solde</button>
              <button className={styles.btnPrimary} style={{ flex: 1, justifyContent: 'center' }} onClick={requestRecharge}>Demander une recharge</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL SUPPRESSION COMPTE ── */}
      {deleteAccountOpen && (
        <div className={styles.modalOv} onClick={() => setDeleteAccountOpen(false)}>
          <div className={styles.modalBox} style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: 24, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <i className="ph ph-warning" style={{ fontSize: 30, color: 'var(--error)' }} />
              <h3 style={{ fontSize: 16, fontWeight: 900 }}>Supprimer mon compte ?</h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Action <strong style={{ color: 'var(--error)' }}>permanente et irréversible</strong>.</p>
              <div style={{ background: 'var(--surface-2)', border: '1.5px solid var(--border)', borderRadius: 10, padding: '10px 14px', width: '100%', textAlign: 'left' }}>
                <label className={styles.formLabel} style={{ display: 'block', marginBottom: 6 }}>Tapez <strong style={{ color: 'var(--error)' }}>SUPPRIMER</strong> pour confirmer</label>
                <input className={styles.input} value={deleteAccountText} onChange={(e) => setDeleteAccountText(e.target.value)} placeholder="SUPPRIMER" />
              </div>
              <div style={{ display: 'flex', gap: 10, width: '100%' }}>
                <button className={styles.btnGhost} style={{ flex: 1, justifyContent: 'center' }} onClick={() => setDeleteAccountOpen(false)}>Annuler</button>
                <button className={styles.btnDanger} style={{ flex: 1, justifyContent: 'center', opacity: deleteAccountText === 'SUPPRIMER' ? 1 : 0.4 }} disabled={deleteAccountText !== 'SUPPRIMER'} onClick={confirmDeleteAccount}>Supprimer définitivement</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── NAV MOBILE + FAB ── */}
      <nav className={styles.bottomNav}>
        <button className={`${styles.bnItem} ${section === 'overview' ? styles.bnItemActive : ''}`} onClick={() => showSection('overview')}><i className="ph ph-squares-four" /><span>Accueil</span></button>
        <button className={`${styles.bnItem} ${section === 'products' ? styles.bnItemActive : ''}`} onClick={() => showSection('products')}><i className="ph ph-package" /><span>Produits</span></button>
        <button className={`${styles.bnItem} ${section === 'orders' ? styles.bnItemActive : ''}`} onClick={() => showSection('orders')}><i className="ph ph-shopping-bag" /><span>Commandes</span></button>
        <button className={`${styles.bnItem} ${section === 'revenue' ? styles.bnItemActive : ''}`} onClick={() => showSection('revenue')}><i className="ph ph-currency-circle-dollar" /><span>Revenus</span></button>
        <button className={styles.bnItem} onClick={() => setSidebarOpen(true)}><i className="ph ph-dots-three-outline" /><span>Plus</span></button>
      </nav>
      <button className={styles.fab} onClick={() => { showSection('products'); openProductModal(); }}><i className="ph ph-plus" /></button>
    </div>
  );
}
