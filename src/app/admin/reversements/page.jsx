'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';
import a from '../admin.module.css';
import s from '../staff.module.css';

// Reversements aux vendeurs (admin uniquement) : une ligne par commande
// livrée et payée (brut − commission de la catégorie = net), créée en base
// au passage de la commande en « livrée ».

const money = (n, c) => `${Number(n || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${c === 'XAF' || c === 'XOF' ? 'FCFA' : c}`;
const when = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—');

export default function ReversementsPage() {
  const [access, setAccess] = useState('checking');
  const [status, setStatus] = useState('pending');
  const [rows, setRows] = useState([]);
  const [paying, setPaying] = useState(null);
  const [form, setForm] = useState({ txn: '', method: 'airtel_money', dest: '' });
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      const sb = getSupabase();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { setAccess('login'); return; }
      const { data } = await sb.from('users').select('role').eq('auth_id', session.user.id).maybeSingle();
      setAccess(data?.role === 'admin' ? 'ok' : 'denied');
    })();
  }, []);

  const load = useCallback(async () => {
    const { data } = await getSupabase().from('settlements')
      .select('id,order_id,currency,gross,commission,net,status,method,destination_number,transaction_id,paid_at,created_at,shops(name,whatsapp),users:vendor_id(full_name,email,phone)')
      .eq('status', status).order('created_at', { ascending: true });
    setRows(data || []);
  }, [status]);

  useEffect(() => { if (access === 'ok') load(); }, [access, load]);

  async function markPaid() {
    setError(null);
    if (!form.txn.trim()) { setError("Indique l'ID de transaction du reversement."); return; }
    const { error: e } = await getSupabase().rpc('mark_settlement_paid', {
      p_settlement_id: paying.id, p_transaction_id: form.txn, p_method: form.method, p_destination: form.dest,
    });
    if (e) { setError(e.message); return; }
    setPaying(null);
    setForm({ txn: '', method: 'airtel_money', dest: '' });
    await load();
  }

  if (access === 'checking') return <div className={s.page}>Chargement…</div>;
  if (access === 'login') return <div className={s.page}><p>Connecte-toi avec un compte administrateur.</p><Link href="/connexion?next=/admin/reversements" className={a.btnPrimary}>Se connecter</Link></div>;
  if (access === 'denied') return <div className={s.page}><p>Accès réservé aux administrateurs.</p></div>;

  const totals = rows.reduce((acc, r) => { acc[r.currency] = (acc[r.currency] || 0) + Number(r.net); return acc; }, {});

  return (
    <div className={s.page}>
      <div className={s.head}>
        <h1 className={s.title}>Reversements vendeurs</h1>
        <Link href="/admin" className={s.back}>Retour à l'admin</Link>
      </div>
      <div className={s.tabs}>
        {[['pending', 'À reverser'], ['paid', 'Payés']].map(([k, label]) => (
          <button key={k} className={`${s.tab} ${status === k ? s.tabActive : ''}`} onClick={() => setStatus(k)}>{label}</button>
        ))}
      </div>
      {rows.length > 0 && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
          Total net {status === 'pending' ? 'à reverser' : 'reversé'} : {Object.entries(totals).map(([c, v]) => money(v, c)).join(' · ')}
        </p>
      )}
      <div className={a.card}>
        <div className={a.tableWrap}>
          <table className={a.table}>
            <thead><tr><th>Commande</th><th>Boutique</th><th>Brut</th><th>Commission</th><th>Net</th><th>{status === 'paid' ? 'Transaction' : 'Contact'}</th><th></th></tr></thead>
            <tbody>
              {rows.length === 0 ? <tr><td colSpan={7} className={a.empty}>Rien à afficher.</td></tr> : rows.map((r) => (
                <tr key={r.id}>
                  <td className={s.mono}>{String(r.order_id).slice(0, 8).toUpperCase()}<br /><span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{when(r.created_at)}</span></td>
                  <td>{r.shops?.name || '—'}<br /><span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{r.users?.full_name || r.users?.email}</span></td>
                  <td>{money(r.gross, r.currency)}</td>
                  <td>{money(r.commission, r.currency)}</td>
                  <td><strong>{money(r.net, r.currency)}</strong></td>
                  <td>{status === 'paid'
                    ? <span className={s.mono}>{r.transaction_id}<br /><span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{when(r.paid_at)}</span></span>
                    : (r.users?.phone || r.shops?.whatsapp || '—')}</td>
                  <td>{status === 'pending' && (
                    <button className={`${a.btnPrimary} ${a.btnSm}`} onClick={() => { setPaying(r); setForm({ txn: '', method: 'airtel_money', dest: r.users?.phone || r.shops?.whatsapp || '' }); }}>Marquer comme payé</button>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {paying && (
        <div className={a.modalOv} onClick={() => setPaying(null)}>
          <div className={a.modalBox} style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className={a.modalHead}>
              <span>Reversement de {money(paying.net, paying.currency)}</span>
              <button className={a.modalClose} onClick={() => setPaying(null)} aria-label="Fermer"><i className="ph ph-x" /></button>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label className={a.formLabel} htmlFor="txn">ID de transaction du reversement *</label>
              <input id="txn" className={a.input} value={form.txn} onChange={(e) => setForm({ ...form, txn: e.target.value })} />
              <label className={a.formLabel} htmlFor="method">Moyen</label>
              <select id="method" className={a.input} value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                <option value="airtel_money">Airtel Money</option>
                <option value="moov_money">Moov Money</option>
                <option value="virement">Virement bancaire</option>
              </select>
              <label className={a.formLabel} htmlFor="dest">Numéro / RIB du vendeur</label>
              <input id="dest" className={a.input} value={form.dest} onChange={(e) => setForm({ ...form, dest: e.target.value })} />
              {error && <p className={s.err}>{error}</p>}
              <button className={a.btnPrimary} onClick={markPaid}>Confirmer le reversement</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
