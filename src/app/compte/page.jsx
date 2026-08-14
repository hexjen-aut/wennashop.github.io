'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';
import Nav from '@/components/Nav';
import CartSidebar from '@/components/CartSidebar';
import styles from './compte.module.css';

function fmt(n, currency = 'MAD') {
  try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(n); }
  catch { return `${n} ${currency}`; }
}
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : ''; }

const STATUS_LABEL = { pending: 'En attente', processing: 'En préparation', shipped: 'En transit', delivered: 'Livré', cancelled: 'Annulée' };

export default function ComptePage() {
  const router = useRouter();
  const [cartOpen, setCartOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('commandes');

  useEffect(() => {
    (async () => {
      const sb = getSupabase();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { router.push('/connexion'); return; }

      const { data } = await sb.from('users').select('*').eq('auth_id', session.user.id).single();
      setProfile(data || { email: session.user.email });

      if (data?.id) {
        const { data: o } = await sb.from('orders')
          .select('id,status,total_amount,currency,created_at')
          .eq('user_id', data.id).order('created_at', { ascending: false }).limit(20);
        setOrders(o || []);
      }
      setLoading(false);
    })();
  }, [router]);

  async function handleLogout() {
    const sb = getSupabase();
    await sb.auth.signOut();
    router.push('/connexion');
  }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-faint)' }}>Chargement…</div>;

  const initials = ((profile?.first_name?.[0] || '') + (profile?.last_name?.[0] || '')).toUpperCase() || (profile?.email?.[0] || '?').toUpperCase();
  const fullName = profile?.full_name || `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || profile?.email;

  return (
    <>
      <Nav onOpenCart={() => setCartOpen(true)} />
      <CartSidebar open={cartOpen} onClose={() => setCartOpen(false)} />

      <div className={styles.wrap} style={{ paddingTop: 'calc(var(--nav-height) + 32px)' }}>
        <div className={styles.header}>
          <div className={styles.avatar}>{initials}</div>
          <div style={{ flex: 1 }}>
            <div className={styles.name}>{fullName}</div>
            <div className={styles.email}>{profile?.email}</div>
          </div>
          <button className={styles.btnLogout} onClick={handleLogout}>Déconnexion</button>
        </div>

        {profile?.role === 'artisan' && (
          <div className={styles.card} style={{ background: 'var(--accent-light)', borderColor: 'var(--border-accent)' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)', marginBottom: 4 }}>Espace vendeur actif</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>Gère tes produits, commandes et revenus.</div>
            <Link href="/vendeur" style={{ display: 'inline-block', background: 'var(--accent)', color: '#fff', padding: '10px 20px', borderRadius: 999, fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>Ouvrir le Dashboard</Link>
          </div>
        )}

        <div className={styles.tabs}>
          <button className={`${styles.tab} ${tab === 'commandes' ? styles.tabActive : ''}`} onClick={() => setTab('commandes')}>Commandes</button>
          <button className={`${styles.tab} ${tab === 'parametres' ? styles.tabActive : ''}`} onClick={() => setTab('parametres')}>Paramètres</button>
        </div>

        {tab === 'commandes' && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Mes commandes</div>
            {orders.length === 0 ? (
              <div className={styles.empty}>Aucune commande pour l'instant.<br /><Link href="/boutique" style={{ color: 'var(--accent)' }}>Découvrir la boutique</Link></div>
            ) : orders.map((o) => (
              <div className={styles.row} key={o.id}>
                <div className={styles.rowInfo}>
                  <div className={styles.rowName}>Commande #{o.id.slice(0, 8).toUpperCase()}</div>
                  <div className={styles.rowMeta}>{fmtDate(o.created_at)} · {STATUS_LABEL[o.status] || o.status}</div>
                </div>
                <div style={{ fontWeight: 900, color: 'var(--accent)' }}>{fmt(o.total_amount, o.currency)}</div>
              </div>
            ))}
          </div>
        )}

        {tab === 'parametres' && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Informations personnelles</div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Email : {profile?.email}</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>Pays : {profile?.country || '—'}</p>
          </div>
        )}
      </div>
    </>
  );
}
