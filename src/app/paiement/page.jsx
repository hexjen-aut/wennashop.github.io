'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';
import Nav from '@/components/Nav';
import styles from './paiement.module.css';

function fmt(n, c = 'MAD') { try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: c }).format(n); } catch { return `${n} ${c}`; } }

function PaiementContent() {
  const params = useSearchParams();
  const orderId = params.get('order_id');
  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);

  const [form, setForm] = useState({ first: '', last: '', address: '', city: '', country: 'Maroc', notes: '' });
  const [method, setMethod] = useState('cash_on_delivery');

  useEffect(() => {
    if (!orderId) { setError('Aucune commande spécifiée.'); setLoading(false); return; }
    (async () => {
      const sb = getSupabase();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { setError('Session expirée.'); setLoading(false); return; }

      // Profil — auth_id d'abord, email en fallback (aligné sur panier/vendeur)
      let profile = null;
      const { data: byAuth } = await sb.from('users').select('id').eq('auth_id', user.id).maybeSingle();
      if (byAuth) {
        profile = byAuth;
      } else {
        const { data: byEmail } = await sb.from('users').select('id').ilike('email', user.email).maybeSingle();
        if (byEmail) {
          profile = byEmail;
          await sb.from('users').update({ auth_id: user.id }).eq('id', byEmail.id);
        }
      }
      if (!profile) { setError('Profil introuvable. Contacte le support.'); setLoading(false); return; }

      const { data: o } = await sb.from('orders').select('*').eq('id', orderId).single();
      if (!o) { setError('Commande introuvable.'); setLoading(false); return; }
      if (o.user_id !== profile.id) { setError("Cette commande ne t'appartient pas."); setLoading(false); return; }
      if (['processing', 'shipped', 'delivered'].includes(o.status)) { setSuccess(true); setLoading(false); return; }
      setOrder(o);
      const { data: it } = await sb.from('order_items').select('id,quantity,unit_price,products(name,image_url)').eq('order_id', orderId);
      setItems(it || []);
      setLoading(false);
    })();
  }, [orderId]);

  async function submit() {
    if (!form.first || !form.last || !form.address || !form.city) { alert('Complète tous les champs requis.'); return; }
    setSending(true);
    const sb = getSupabase();
    const { data: { user } } = await sb.auth.getUser();
    let row = null;
    const { data: byAuth } = await sb.from('users').select('id').eq('auth_id', user.id).maybeSingle();
    row = byAuth || (await sb.from('users').select('id').ilike('email', user.email).maybeSingle()).data;
    if (row?.id !== order.user_id) { alert("Cette commande ne t'appartient pas."); setSending(false); return; }
    await sb.from('orders').update({
      shipping_name: `${form.first} ${form.last}`, shipping_address: form.address, shipping_city: form.city,
      shipping_country: form.country, notes: form.notes || null, status: 'processing', updated_at: new Date().toISOString(),
    }).eq('id', orderId);
    await sb.from('payments').insert({ order_id: orderId, amount: order.total_amount, currency: order.currency || 'MAD', method, status: 'pending', type: 'order_payment' });
    if (row) await sb.from('cart_items').delete().eq('user_id', row.id);
    setSending(false);
    setSuccess(true);
  }

  if (loading) return <><Nav /><div style={{ padding: 60, textAlign: 'center', color: 'var(--text-faint)' }}>Chargement…</div></>;
  if (error) return <><Nav /><div style={{ padding: 60, textAlign: 'center' }}><p>{error}</p><Link href="/panier" style={{ color: 'var(--accent)' }}>Retour au panier</Link></div></>;
  if (success) return (
    <>
      <Nav />
      <div style={{ padding: 80, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>✅</div>
        <h1 style={{ fontSize: 30, fontWeight: 900, marginBottom: 8 }}>Commande confirmée !</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>Merci pour ta commande. Tu recevras une confirmation par email.</p>
        <Link href="/boutique" style={{ background: 'var(--accent)', color: '#fff', padding: '12px 28px', borderRadius: 999, fontWeight: 700, textDecoration: 'none' }}>Continuer mes achats</Link>
      </div>
    </>
  );

  return (
    <>
      <Nav />
      <div className={styles.wrap}>
        <h1 className={styles.title}>Paiement</h1>
        <div className={styles.layout}>
          <div className={styles.main}>
            <div className={styles.card}>
              <div className={styles.cardTitle}>Coordonnées de livraison</div>
              <div className={styles.grid2}>
                <input className={styles.input} placeholder="Prénom *" value={form.first} onChange={(e) => setForm({ ...form, first: e.target.value })} />
                <input className={styles.input} placeholder="Nom *" value={form.last} onChange={(e) => setForm({ ...form, last: e.target.value })} />
              </div>
              <input className={styles.input} style={{ marginTop: 12 }} placeholder="Adresse *" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              <div className={styles.grid2} style={{ marginTop: 12 }}>
                <input className={styles.input} placeholder="Ville *" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                <select className={styles.input} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}>
                  <option value="Maroc">🇲🇦 Maroc</option>
                  <option value="Gabon">🇬🇦 Gabon</option>
                </select>
              </div>
              <textarea className={styles.input} style={{ marginTop: 12, minHeight: 70 }} placeholder="Notes (optionnel)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>

            <div className={styles.card}>
              <div className={styles.cardTitle}>Méthode de paiement</div>
              <div className={styles.methods}>
                <button className={`${styles.methodCard} ${method === 'cash_on_delivery' ? styles.methodActive : ''}`} onClick={() => setMethod('cash_on_delivery')}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>Paiement à la livraison</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Espèces à la réception</div>
                </button>
                <button className={`${styles.methodCard} ${method === 'virement' ? styles.methodActive : ''}`} onClick={() => setMethod('virement')}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>Virement bancaire</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Attijari · CIH · BCP</div>
                </button>
              </div>
              {method === 'virement' && (
                <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', marginTop: 14, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  <p style={{ marginBottom: 6 }}>Effectue un virement à :</p>
                  <p style={{ fontWeight: 700, letterSpacing: '.5px', marginBottom: 4, color: 'var(--text)' }}>RIB : 0000 0000 0000 0000 0000 0000 000</p>
                  <p>Banque : Attijari Maroc · SWIFT : BCMAMAMC</p>
                </div>
              )}
            </div>
          </div>

          <div className={styles.aside}>
            <div className={styles.card}>
              <div className={styles.cardTitle}>Récapitulatif</div>
              {items.map((it) => (
                <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span>{it.products?.name} × {it.quantity}</span>
                  <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{fmt(it.unit_price * it.quantity, order?.currency)}</span>
                </div>
              ))}
              {order?.discount_pct > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '8px 0', color: 'var(--success)' }}>
                  <span>Remise ({order.promo_code})</span>
                  <span>−{fmt((order.subtotal || order.total_amount) * (order.discount_pct / 100), order.currency)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 900, marginTop: 14 }}>
                <span>Total</span><span style={{ color: 'var(--accent)' }}>{fmt(order?.total_amount, order?.currency)}</span>
              </div>
              <button className={styles.btnSubmit} onClick={submit} disabled={sending}>{sending ? 'Traitement…' : 'Confirmer la commande'}</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function PaiementPage() {
  return <Suspense fallback={null}><PaiementContent /></Suspense>;
}
