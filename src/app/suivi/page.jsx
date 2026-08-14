'use client';

import { useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import Nav from '@/components/Nav';
import styles from './suivi.module.css';

const STEPS = [
  { key: 'pending', label: 'Commande confirmée' },
  { key: 'processing', label: 'En préparation' },
  { key: 'shipped', label: 'Expédiée' },
  { key: 'delivered', label: 'Livrée' },
];
const STATUS_INDEX = { pending: 0, processing: 1, shipped: 2, in_transit: 2, delivered: 3, cancelled: -1 };
const BADGE = {
  pending: { bg: 'rgba(245,158,11,.12)', color: 'var(--gold)', label: 'En attente' },
  processing: { bg: 'rgba(59,130,246,.12)', color: '#3b82f6', label: 'En préparation' },
  shipped: { bg: 'rgba(59,130,246,.12)', color: '#3b82f6', label: 'Expédiée' },
  delivered: { bg: 'rgba(34,197,94,.12)', color: 'var(--success)', label: 'Livrée' },
  cancelled: { bg: 'rgba(239,68,68,.12)', color: 'var(--error)', label: 'Annulée' },
};

function fmt(n, c = 'MAD') { try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: c }).format(n); } catch { return `${n} ${c}`; } }

export default function SuiviPage() {
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState(null);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);

  async function search() {
    if (!query.trim()) return;
    setSearching(true); setNotFound(false); setOrder(null);
    const sb = getSupabase();
    let { data } = await sb.from('orders')
      .select('id,tracking_number,status,created_at,total_amount,currency,shipping_name,shipping_city')
      .ilike('tracking_number', query.trim()).maybeSingle();

    if (!data) {
      const clean = query.trim().replace(/^#/, '').toLowerCase();
      const { data: all } = await sb.from('orders').select('id,tracking_number,status,created_at,total_amount,currency,shipping_name,shipping_city').limit(200);
      data = (all || []).find((o) => o.id?.toLowerCase().startsWith(clean) || o.tracking_number?.toLowerCase().includes(clean));
    }
    setSearching(false);
    if (!data) { setNotFound(true); return; }
    setOrder(data);
  }

  const idx = order ? (STATUS_INDEX[order.status] ?? 0) : -1;
  const badge = order ? (BADGE[order.status] || BADGE.pending) : null;

  return (
    <>
      <Nav />
      <div className={styles.wrap}>
        <div className={styles.searchBlock}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Suivre ma commande</div>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 16 }}>Numéro de commande ou code de suivi</div>
          <div className={styles.searchRow}>
            <input className={styles.input} placeholder="Ex: WNS-20240501-ABCD…" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
            <button className={styles.btnSearch} onClick={search}>{searching ? '…' : 'Rechercher'}</button>
          </div>
        </div>

        {notFound && <div style={{ textAlign: 'center', padding: 30, color: 'var(--error)' }}>Commande introuvable. Vérifie le numéro.</div>}

        {order && (
          <>
            <div className={styles.orderHeader}>
              <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-faint)', marginBottom: 4 }}>
                {order.tracking_number || `#${order.id.slice(0, 8).toUpperCase()}`}
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>{order.shipping_name || 'Commande WennaShop'}</div>
              <span className={styles.badge} style={{ background: badge.bg, color: badge.color }}>{badge.label}</span>
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>{fmt(order.total_amount, order.currency)} · {order.shipping_city || ''}</div>
            </div>

            {order.status !== 'cancelled' && (
              <div className={styles.orderHeader}>
                <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 16 }}>Historique du suivi</div>
                <div className={styles.timeline}>
                  {STEPS.map((s, i) => (
                    <div className={styles.step} key={s.key}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div className={`${styles.dot} ${i <= idx ? styles.dotDone : styles.dotPending}`}>{i <= idx ? '✓' : i + 1}</div>
                        {i < STEPS.length - 1 && <div className={styles.line} />}
                      </div>
                      <div className={styles.stepLabel} style={{ color: i <= idx ? 'var(--text)' : 'var(--text-faint)' }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
