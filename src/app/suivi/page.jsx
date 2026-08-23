'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
import Nav from '@/components/Nav';
import styles from './suivi.module.css';

const TL_STEPS = [
  { key: 'pending', label: 'Commande confirmée', desc: 'Commande validée et transmise au vendeur.' },
  { key: 'picked_up', label: 'Colis pris en charge', desc: 'Le livreur a récupéré le colis chez le vendeur.' },
  { key: 'in_transit', label: 'En transit', desc: 'Le colis est en route vers la destination finale.' },
  { key: 'out_for_delivery', label: 'En cours de livraison', desc: 'Le livreur est en chemin — votre colis arrive aujourd\u2019hui.' },
  { key: 'delivered', label: 'Colis livré', desc: 'Le colis a été remis au destinataire avec succès.' },
];
const STATUS_INDEX = { pending: 0, processing: 0, picked_up: 1, shipped: 2, in_transit: 2, out_for_delivery: 3, delivered: 4, cancelled: -1, returned: -1 };
const BADGE = {
  pending: { bg: 'rgba(245,158,11,.12)', color: 'var(--gold)', label: 'En attente' },
  processing: { bg: 'rgba(59,130,246,.12)', color: '#3b82f6', label: 'En traitement' },
  picked_up: { bg: 'var(--accent-light)', color: 'var(--accent)', label: 'Pris en charge' },
  shipped: { bg: 'rgba(59,130,246,.12)', color: '#3b82f6', label: 'Expédiée' },
  in_transit: { bg: 'rgba(59,130,246,.12)', color: '#3b82f6', label: 'En transit' },
  out_for_delivery: { bg: 'rgba(245,158,11,.12)', color: 'var(--gold)', label: 'En livraison' },
  delivered: { bg: 'rgba(34,197,94,.12)', color: 'var(--success)', label: 'Livré' },
  cancelled: { bg: 'rgba(239,68,68,.12)', color: 'var(--error)', label: 'Annulée' },
  returned: { bg: 'rgba(239,68,68,.12)', color: 'var(--error)', label: 'Retournée' },
};
const ETA_DAYS = { pending: '5–7 jours', processing: '4–6 jours', picked_up: '3–5 jours', shipped: '2–4 jours', in_transit: '2–3 jours', out_for_delivery: 'aujourd\u2019hui' };

function fmt(n, c = 'MAD') { try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: c }).format(n); } catch { return `${n} ${c}`; } }
function fmtDateShort(d) { return d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; }
function initials(name) { return name ? name.split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2) : '?'; }
function resolveImg(raw) {
  if (!raw) return '';
  if (raw.startsWith('[')) { try { const a = JSON.parse(raw); return a[0] || ''; } catch { return ''; } }
  return raw;
}

async function fetchOrder(sb, identifier, userId) {
  let order = null;
  const { data: byTrack } = await sb.from('orders')
    .select(`id, tracking_number, status, created_at, updated_at, total_amount, currency, shipping_name, shipping_address, shipping_city, shipping_country, delivery_address, user_id,
      order_items(id, quantity, unit_price, products(id, name, image_url, images, seller_id, origin_city, country)),
      deliveries(id, status, picked_up_at, in_transit_at, out_for_delivery_at, delivered_at, estimated_delivery, notes, users!deliveries_driver_id_fkey(full_name, phone, specialty))`)
    .ilike('tracking_number', identifier).maybeSingle();
  order = byTrack;

  if (!order) {
    const clean = identifier.replace(/^#/, '').toLowerCase();
    const { data: all } = await sb.from('orders')
      .select(`id, tracking_number, status, created_at, updated_at, total_amount, currency, shipping_name, shipping_address, shipping_city, shipping_country, delivery_address, user_id,
        order_items(id, quantity, unit_price, products(id, name, image_url, images, seller_id, origin_city, country)),
        deliveries(id, status, picked_up_at, in_transit_at, out_for_delivery_at, delivered_at, estimated_delivery, notes, users!deliveries_driver_id_fkey(full_name, phone, specialty))`)
      .order('created_at', { ascending: false }).limit(200);
    if (all) order = all.find((o) => o.id?.toLowerCase().startsWith(clean) || o.tracking_number?.toLowerCase().includes(clean));
  }

  if (!order && userId) {
    const clean = identifier.replace(/^#/, '').toLowerCase();
    const { data: mine } = await sb.from('orders').select('id,tracking_number').eq('user_id', userId).limit(50);
    const found = (mine || []).find((o) => o.tracking_number?.toLowerCase().includes(clean) || o.id?.toLowerCase().includes(clean));
    if (found) return fetchOrder(sb, found.tracking_number || found.id, null);
  }

  if (!order) return null;

  if (order.order_items?.length) {
    const sellerIds = [...new Set(order.order_items.map((i) => i.products?.seller_id).filter(Boolean))];
    if (sellerIds.length) {
      const { data: sellers } = await sb.from('users').select('id, full_name, email, specialty, city, country, origin_city').in('id', sellerIds);
      const sellerMap = Object.fromEntries((sellers || []).map((s) => [s.id, s]));
      order.order_items = order.order_items.map((item) => ({ ...item, products: item.products ? { ...item.products, seller: sellerMap[item.products.seller_id] || null } : null }));
    }
  }
  return order;
}

export default function SuiviPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState(null);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [session, setSession] = useState(null);
  const [tab, setTab] = useState('search');
  const [myOrders, setMyOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [liveMsg, setLiveMsg] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      const sb = getSupabase();
      const { data: { session: s } } = await sb.auth.getSession();
      setSession(s);
      const initial = searchParams.get('tracking') || searchParams.get('order');
      if (initial) { setQuery(initial); await search(initial, s); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!order?.id) return;
    const sb = getSupabase();
    const channel = sb.channel('tracking-' + order.id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${order.id}` }, async (payload) => {
        if (payload.new?.status && payload.new.status !== order.status) {
          setLiveMsg('Statut mis à jour : ' + (BADGE[payload.new.status]?.label || payload.new.status));
          setTimeout(() => setLiveMsg(''), 5000);
          await search(order.tracking_number || order.id, session, true);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries', filter: `order_id=eq.${order.id}` }, async () => {
        setLiveMsg('Informations de livraison mises à jour');
        setTimeout(() => setLiveMsg(''), 5000);
        await search(order.tracking_number || order.id, session, true);
      })
      .subscribe();
    return () => { sb.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id]);

  async function search(q, sess, silent) {
    const value = (q ?? query).trim();
    if (!value) return;
    if (!silent) { setSearching(true); setNotFound(false); }
    const sb = getSupabase();
    const data = await fetchOrder(sb, value, (sess ?? session)?.user?.id);
    if (!silent) setSearching(false);
    if (!data) { if (!silent) { setNotFound(true); setOrder(null); } return; }
    setOrder(data);
    setNotFound(false);
    const url = new URL(window.location.href);
    url.searchParams.set('tracking', data.tracking_number || data.id);
    window.history.replaceState({}, '', url);
  }

  async function loadMyOrders() {
    if (!session) return;
    setLoadingOrders(true);
    const sb = getSupabase();
    const { data } = await sb.from('orders')
      .select('id, tracking_number, status, created_at, total_amount, currency, shipping_name, order_items(quantity, products(name, image_url, images))')
      .eq('user_id', session.user.id).order('created_at', { ascending: false }).limit(20);
    setMyOrders(data || []);
    setLoadingOrders(false);
  }

  function goTab(t) {
    setTab(t);
    if (t === 'orders' && myOrders.length === 0) loadMyOrders();
  }

  function openOrder(ref) {
    setQuery(ref);
    setTab('search');
    search(ref);
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  const idx = order ? (STATUS_INDEX[order.status] ?? 0) : -1;
  const badge = order ? (BADGE[order.status] || BADGE.pending) : null;
  const isCancelled = order && ['cancelled', 'returned'].includes(order.status);
  const items = order?.order_items || [];
  const seller = items[0]?.products?.seller;
  const delivery = Array.isArray(order?.deliveries) ? order.deliveries[0] : order?.deliveries;
  const driver = delivery?.users;
  const showDriver = driver && ['picked_up', 'shipped', 'in_transit', 'out_for_delivery', 'delivered'].includes(order?.status);
  const showEta = order && !['delivered', 'cancelled', 'returned'].includes(order.status);

  return (
    <>
      <Nav />
      <div className={styles.wrap}>

        {liveMsg && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 10, padding: '8px 14px', marginBottom: 12, fontSize: 12, fontWeight: 700, color: 'var(--success)' }}>
            <span style={{ width: 7, height: 7, background: 'var(--success)', borderRadius: '50%' }} />{liveMsg}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button onClick={() => goTab('search')} style={{ padding: '7px 16px', fontSize: 12, fontWeight: 700, borderRadius: 999, cursor: 'pointer', background: tab === 'search' ? 'var(--accent-light)' : 'transparent', border: tab === 'search' ? '1.5px solid var(--border-accent)' : '1.5px solid var(--border)', color: tab === 'search' ? 'var(--accent)' : 'var(--text-faint)' }}>Suivre un colis</button>
          <button onClick={() => goTab('orders')} style={{ padding: '7px 16px', fontSize: 12, fontWeight: 700, borderRadius: 999, cursor: 'pointer', background: tab === 'orders' ? 'var(--accent-light)' : 'transparent', border: tab === 'orders' ? '1.5px solid var(--border-accent)' : '1.5px solid var(--border)', color: tab === 'orders' ? 'var(--accent)' : 'var(--text-faint)' }}>Mes commandes</button>
        </div>

        {tab === 'search' && (
          <>
            <div className={styles.searchBlock}>
              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Suivre ma commande</div>
              <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 16 }}>Numéro de commande ou code de suivi</div>
              <div className={styles.searchRow}>
                <input className={styles.input} placeholder="Ex: WNS-20240501-ABCD…" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
                <button className={styles.btnSearch} onClick={() => search()}>{searching ? '…' : 'Rechercher'}</button>
              </div>
            </div>

            {notFound && <div style={{ textAlign: 'center', padding: 30, color: 'var(--error)' }}>Commande introuvable. Vérifiez le numéro.</div>}

            {order && (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <button onClick={copyLink} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 999, color: 'var(--text-muted)', padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{copied ? 'Copié ✓' : 'Copier le lien'}</button>
                  <button onClick={() => search(order.tracking_number || order.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 999, color: 'var(--text-muted)', padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Actualiser</button>
                </div>

                <div className={styles.orderHeader}>
                  <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-faint)', marginBottom: 4 }}>{order.tracking_number || `#${order.id.slice(0, 8).toUpperCase()}`}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>{items[0]?.products?.name ? (items.length > 1 ? `${items[0].products.name} + ${items.length - 1} article(s)` : items[0].products.name) : (order.shipping_name || 'Commande WennaShop')}</div>
                  <span className={styles.badge} style={{ background: badge.bg, color: badge.color }}>{badge.label}</span>
                  <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>{fmt(order.total_amount, order.currency)} · {fmtDateShort(order.created_at)} · Vendeur : {seller?.full_name || seller?.specialty || '—'}</div>
                </div>

                {showEta && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(245,158,11,.12)', border: '1.5px solid rgba(245,158,11,.3)', borderRadius: 16, padding: '12px 20px', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>
                      {delivery?.estimated_delivery ? <>Livraison estimée le <strong style={{ color: 'var(--text)' }}>{fmtDateShort(delivery.estimated_delivery)}</strong></> : <>Livraison estimée dans <strong style={{ color: 'var(--text)' }}>{ETA_DAYS[order.status] || '—'}</strong></>}
                    </span>
                  </div>
                )}

                {showDriver && (
                  <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 16, padding: '18px 20px', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--accent-light)', border: '1.5px solid var(--border-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: 'var(--accent)' }}>{initials(driver.full_name)}</div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 2 }}>{driver.full_name || '—'}</div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)' }}>{driver.specialty || 'Livreur WennaShop'}</div>
                      </div>
                    </div>
                    {driver.phone && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <a href={`tel:${driver.phone}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1.5px solid rgba(34,197,94,.3)', background: 'rgba(34,197,94,.12)', color: 'var(--success)', padding: '8px 16px', fontSize: 11, fontWeight: 700, borderRadius: 999, textDecoration: 'none' }}>Appeler</a>
                        <a href={`https://wa.me/${driver.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1.5px solid var(--border-accent)', background: 'var(--accent-light)', color: 'var(--accent)', padding: '8px 16px', fontSize: 11, fontWeight: 700, borderRadius: 999, textDecoration: 'none' }}>WhatsApp</a>
                      </div>
                    )}
                  </div>
                )}

                {!isCancelled ? (
                  <div className={styles.orderHeader}>
                    <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 16 }}>Historique du suivi</div>
                    <div className={styles.timeline}>
                      {TL_STEPS.map((s, i) => {
                        const done = i < idx, active = i === idx;
                        const stepDates = { pending: order.created_at, picked_up: delivery?.picked_up_at, in_transit: delivery?.in_transit_at, out_for_delivery: delivery?.out_for_delivery_at, delivered: delivery?.delivered_at };
                        return (
                          <div className={styles.step} key={s.key}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                              <div className={`${styles.dot} ${done || active ? styles.dotDone : styles.dotPending}`}>{done ? '✓' : i + 1}</div>
                              {i < TL_STEPS.length - 1 && <div className={styles.line} />}
                            </div>
                            <div>
                              <div className={styles.stepLabel} style={{ color: done || active ? 'var(--text)' : 'var(--text-faint)', paddingBottom: 4 }}>{s.label}</div>
                              {(done || active) && <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', marginBottom: 4 }}>{fmtDate(stepDates[s.key])}</div>}
                              {(done || active) && <div style={{ fontSize: 12, color: 'var(--text-muted)', paddingBottom: 16 }}>{s.desc}</div>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className={styles.orderHeader}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--error)' }}>Cette commande a été {order.status === 'cancelled' ? 'annulée' : 'retournée'}.</div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                  <div className={styles.orderHeader} style={{ marginBottom: 0 }}>
                    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 6 }}>Expédié depuis</div>
                    <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 3 }}>{seller?.full_name || seller?.specialty || 'Vendeur WennaShop'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{[seller?.origin_city || seller?.city, seller?.country].filter(Boolean).join(', ') || '—'}</div>
                  </div>
                  <div className={styles.orderHeader} style={{ marginBottom: 0 }}>
                    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 6 }}>Destination</div>
                    <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 3 }}>{order.shipping_name || '—'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{[order.shipping_address, order.shipping_city, order.shipping_country].filter(Boolean).join(', ') || '—'}</div>
                  </div>
                </div>

                <div className={styles.orderHeader}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>Articles de la commande</div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)' }}>{items.length} article{items.length > 1 ? 's' : ''}</span>
                  </div>
                  {items.map((item) => {
                    const img = resolveImg(item.products?.images ? JSON.stringify(item.products.images) : item.products?.image_url);
                    return (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid var(--border)' }}>
                        {img ? <img src={img} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} /> : <div style={{ width: 44, height: 44, background: 'var(--surface-2)', borderRadius: 6, flexShrink: 0 }} />}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{item.products?.name || '—'}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>Qté : {item.quantity}</div>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent)' }}>{fmt(item.unit_price * item.quantity, order.currency)}</div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}

        {tab === 'orders' && (
          <div>
            {!session ? (
              <div className={styles.orderHeader} style={{ textAlign: 'center', padding: '40px 24px' }}>
                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>Connexion requise</div>
                <div style={{ fontSize: 13, color: 'var(--text-faint)', marginBottom: 16 }}>Connectez-vous pour retrouver toutes vos commandes</div>
                <button onClick={() => router.push('/connexion')} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 999, padding: '9px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Se connecter</button>
              </div>
            ) : loadingOrders ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-faint)' }}>Chargement…</div>
            ) : myOrders.length === 0 ? (
              <div className={styles.orderHeader} style={{ textAlign: 'center', padding: '40px 24px' }}>Aucune commande</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {myOrders.map((o) => {
                  const firstProd = o.order_items?.[0]?.products;
                  const img = resolveImg(firstProd?.images ? JSON.stringify(firstProd.images) : firstProd?.image_url);
                  const name = firstProd?.name ? (o.order_items.length > 1 ? `${firstProd.name} + ${o.order_items.length - 1}` : firstProd.name) : (o.shipping_name || 'Commande WennaShop');
                  const b = BADGE[o.status] || BADGE.pending;
                  return (
                    <div key={o.id} onClick={() => openOrder(o.tracking_number || o.id)} className={styles.orderHeader} style={{ marginBottom: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {img ? <img src={img} alt="" style={{ width: 46, height: 46, objectFit: 'cover', borderRadius: 8 }} /> : <div style={{ width: 46, height: 46, background: 'var(--surface-2)', borderRadius: 8 }} />}
                        <div>
                          <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-faint)' }}>{o.tracking_number || `#${o.id.slice(0, 8).toUpperCase()}`}</div>
                          <div style={{ fontSize: 13, fontWeight: 800 }}>{name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{fmtDateShort(o.created_at)}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 15, fontWeight: 900, color: 'var(--accent)' }}>{fmt(o.total_amount, o.currency)}</span>
                        <span className={styles.badge} style={{ background: b.bg, color: b.color }}>{b.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
