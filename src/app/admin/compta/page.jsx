'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';
import { downloadCsv, downloadXlsx } from '@/lib/exportSheet';
import a from '../admin.module.css';
import s from '../staff.module.css';
import c from './compta.module.css';

// Comptabilité (admin uniquement). Les écritures sont créées en base :
// automatiquement quand une commande est livrée et payée, ou par les fonctions
// confirm_cod_collected, pay_vendor, pay_hunter, record_expense,
// transfer_funds et add_ledger_adjustment. Cette page ne fait que les appeler ;
// le grand livre n'est jamais modifié depuis le navigateur.

const TABS = [
  ['tableau', 'Tableau de bord'],
  ['encaissements', 'Encaissements'],
  ['livre', 'Grand livre'],
  ['reversements', 'Reversements vendeurs'],
  ['depenses', 'Dépenses'],
  ['chasseurs', 'Chasseurs'],
  ['caisse', 'Caisse'],
];

const TYPE_LABEL = {
  vente_encaissee: 'Vente encaissée',
  commission_wenna: 'Commission Wenna',
  marge_change: 'Marge de change',
  part_vendeur: 'Part vendeur',
  part_chasseur: 'Part chasseur',
  reversement_vendeur: 'Reversement vendeur',
  paiement_chasseur: 'Paiement chasseur',
  depense: 'Dépense',
  remboursement: 'Remboursement',
  remise_fonds: 'Remise de fonds',
  ajustement: 'Ajustement',
};
const METHOD_LABEL = { cod: 'Espèces (livraison)', virement: 'Virement', mobile_money: 'Mobile Money', autre: 'Autre' };
const CATEGORY_LABEL = { outils_ia: 'Outils IA', hebergement: 'Hébergement', livraison: 'Livraison', marketing: 'Marketing', autre: 'Autre' };
const ORDER_STATUS = { pending: 'En attente', processing: 'En préparation', shipped: 'Expédiée', delivered: 'Livrée' };
// Comptes de Wenna : l'argent qui s'y trouve est « remis » ; ailleurs, il reste à récupérer
const WENNA_ACCOUNTS = ['Compte bancaire Maroc', 'Compte Airtel Wenna', 'Compte Moov Wenna'];
const HOLDERS = ['Livreur local', 'Ozone', 'Livreur Gabon', 'Achille', ...WENNA_ACCOUNTS];
const CURRENCIES = ['MAD', 'XAF', 'EUR', 'USD'];

const ERRORS = {
  forbidden: 'Action réservée aux administrateurs.',
  invalid_amount: 'Montant invalide.',
  reference_required: 'Indique la référence (ID de transaction, n° de virement…).',
  collected_by_required: "Indique qui a l'argent.",
  order_not_found: 'Commande introuvable.',
  order_not_delivered: "La commande n'est pas encore expédiée ou livrée.",
  no_pending_cod: 'Aucun paiement à la livraison en attente pour cette commande (déjà confirmé ?).',
  payout_not_pending: 'Ce reversement a déjà été payé.',
  template_not_found: 'Modèle de dépense introuvable.',
  supplier_required: 'Indique le fournisseur.',
  notes_required: 'Explique la correction dans la note.',
  invalid_holders: 'Choisis deux détenteurs différents.',
};
const errText = (e) => {
  const m = e?.message || String(e);
  return Object.entries(ERRORS).find(([k]) => m.includes(k))?.[1] || m;
};

const curLabel = (cur) => (cur === 'XAF' || cur === 'XOF' ? 'FCFA' : cur);
const money = (n, cur) => `${Number(n || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${curLabel(cur)}`;
const day = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—');
const iso = (d) => d.toISOString().slice(0, 10);
const thisMonth = () => iso(new Date()).slice(0, 7);
const monthRange = (m) => {
  const [y, mo] = m.split('-').map(Number);
  return { from: `${m}-01`, to: iso(new Date(Date.UTC(y, mo, 0))) };
};
const monthLabel = (m) => new Date(`${m.slice(0, 7)}-01T12:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
const shortId = (id) => (id ? String(id).slice(0, 8).toUpperCase() : '');
const sumBy = (rows, key, val) => rows.reduce((acc, r) => { acc[r[key]] = (acc[r[key]] || 0) + Number(val(r) || 0); return acc; }, {});

async function uploadProof(file, folder) {
  if (!file) return null;
  const ext = (file.name.split('.').pop() || 'pdf').toLowerCase();
  const path = `${folder}/${iso(new Date())}-${crypto.randomUUID()}.${ext}`;
  const { error } = await getSupabase().storage.from('accounting-proofs').upload(path, file, { contentType: file.type });
  if (error) throw new Error(`Justificatif non envoyé : ${error.message}`);
  return path;
}

async function openProof(path) {
  const { data } = await getSupabase().storage.from('accounting-proofs').createSignedUrl(path, 600);
  if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
}

function Modal({ title, onClose, children }) {
  return (
    <div className={a.modalOv} onClick={onClose}>
      <div className={a.modalBox} style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className={a.modalHead}>
          <span>{title}</span>
          <button className={a.modalClose} onClick={onClose} aria-label="Fermer"><i className="ph ph-x" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return <label><span className={a.formLabel}>{label}</span>{children}</label>;
}

function HolderInput({ value, onChange, id }) {
  return (
    <>
      <input className={a.input} list={`${id}-list`} value={value} onChange={(e) => onChange(e.target.value)} />
      <datalist id={`${id}-list`}>{HOLDERS.map((h) => <option key={h} value={h} />)}</datalist>
    </>
  );
}

function Stat({ label, value, hint, tone }) {
  return (
    <div className={c.stat}>
      <div className={`${c.statNum} ${tone === 'neg' ? c.neg : ''}`}>{value}</div>
      <div className={c.statLabel}>{label}</div>
      {hint && <div className={c.statHint}>{hint}</div>}
    </div>
  );
}

// ═════════════ Tableau de bord ═════════════
function Dashboard({ month, setMonth }) {
  const [pnl, setPnl] = useState([]);
  const [history, setHistory] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [cash, setCash] = useState([]);
  const [hunters, setHunters] = useState([]);

  useEffect(() => {
    const sb = getSupabase();
    sb.from('v_monthly_pnl').select('*').eq('month', `${month}-01`).then(({ data }) => setPnl(data || []));
    sb.from('v_monthly_pnl').select('*').order('month', { ascending: false }).limit(24).then(({ data }) => setHistory(data || []));
    sb.from('v_vendor_balances').select('currency,balance').then(({ data }) => setVendors(data || []));
    sb.from('v_cash_position').select('*').then(({ data }) => setCash(data || []));
    sb.from('v_hunter_balances').select('currency,balance').then(({ data }) => setHunters(data || []));
  }, [month]);

  const owed = sumBy(vendors.filter((v) => Number(v.balance) > 0), 'currency', (v) => v.balance);
  const owedHunters = sumBy(hunters.filter((h) => Number(h.balance) > 0), 'currency', (h) => h.balance);
  const notRemitted = sumBy(cash.filter((x) => !WENNA_ACCOUNTS.includes(x.collected_by) && Number(x.balance) > 0), 'currency', (x) => x.balance);
  const currencies = [...new Set([...pnl.map((p) => p.currency), ...Object.keys(owed), ...Object.keys(notRemitted), ...Object.keys(owedHunters)])].sort();

  return (
    <>
      <div className={c.filters} style={{ border: 'none', padding: '0 0 14px' }}>
        <label className={c.month}><span className={a.formLabel}>Mois</span>
          <input type="month" className={a.input} value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        </label>
      </div>
      <p className={c.note}>
        Revenu de Wenna = commissions + marge de change. Le volume des ventes (GMV) est l'argent qui transite, pas un revenu.
        Chaque devise est comptée à part, sans conversion.
      </p>
      {currencies.length === 0 && <div className={a.card}><p className={a.empty}>Aucune écriture pour l'instant. Les premières apparaîtront à la première commande livrée et payée.</p></div>}
      {currencies.map((cur) => {
        const p = pnl.find((x) => x.currency === cur) || {};
        return (
          <div key={cur} data-testid={`compta-dashboard-${cur}`}>
            <div className={c.cur}>{curLabel(cur)} — {monthLabel(month)}</div>
            <div className={c.stats}>
              <Stat label="Commissions" value={money(p.commissions, cur)} />
              <Stat label="Marge de change" value={money(p.fx_margin, cur)} />
              <Stat label="Coût parrainage" value={money(p.referral_costs, cur)} />
              <Stat label="Dépenses" value={money(p.expenses, cur)} />
              <Stat label="Marge nette" value={money(p.net_margin, cur)} tone={Number(p.net_margin) < 0 ? 'neg' : null} />
              <Stat label="Volume des ventes (GMV)" value={money(p.gmv, cur)} hint={`${p.orders_count || 0} commande(s), remboursé ${money(p.refunds, cur)}`} />
              <Stat label="Dû aux vendeurs" value={money(owed[cur], cur)} hint="Tous mois confondus" />
              <Stat label="Dû aux chasseurs" value={money(owedHunters[cur], cur)} hint="Tous mois confondus" />
              <Stat label="Argent pas encore remis" value={money(notRemitted[cur], cur)} hint="Chez les livreurs, Ozone, prestataires" />
            </div>
          </div>
        );
      })}
      {history.length > 0 && (
        <div className={a.card}>
          <div className={a.cardHead}><span className={a.cardTitle}>Compte de résultat par mois</span></div>
          <div className={a.tableWrap}>
            <table className={a.table}>
              <thead><tr><th>Mois</th><th>Devise</th><th className={c.right}>Revenu</th><th className={c.right}>Parrainage</th><th className={c.right}>Dépenses</th><th className={c.right}>Marge nette</th><th className={c.right}>GMV</th></tr></thead>
              <tbody>{history.map((h) => (
                <tr key={`${h.month}-${h.currency}`}>
                  <td>{monthLabel(h.month)}</td><td>{curLabel(h.currency)}</td>
                  <td className={c.right}>{money(h.revenue, h.currency)}</td>
                  <td className={c.right}>{money(h.referral_costs, h.currency)}</td>
                  <td className={c.right}>{money(h.expenses, h.currency)}</td>
                  <td className={`${c.right} ${Number(h.net_margin) < 0 ? c.neg : c.pos}`}>{money(h.net_margin, h.currency)}</td>
                  <td className={c.right}>{money(h.gmv, h.currency)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

// ═════════════ Encaissements (paiement à la livraison) ═════════════
function Encaissements({ toast }) {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState({ holder: '', reference: '', fee: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    const { data } = await getSupabase().from('payments')
      .select('id,order_id,amount,currency,created_at,orders!inner(id,status,shipping_name,shipping_city,shipping_country,shipping_phone,created_at)')
      .eq('method', 'cash_on_delivery').eq('status', 'pending').eq('type', 'order_payment')
      .order('created_at', { ascending: true });
    setRows(data || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function confirm() {
    setError(null);
    if (!form.holder.trim()) { setError("Indique qui a l'argent."); return; }
    const fee = form.fee === '' ? null : Number(String(form.fee).replace(',', '.'));
    if (fee != null && (!Number.isFinite(fee) || fee < 0)) { setError('Frais de livraison invalides.'); return; }
    setBusy(true);
    const { error: e } = await getSupabase().rpc('confirm_cod_collected', {
      p_order_id: open.order_id, p_collected_by: form.holder.trim(), p_reference: form.reference.trim() || null, p_delivery_fee: fee,
    });
    setBusy(false);
    if (e) { setError(errText(e)); return; }
    setOpen(null);
    toast('Encaissement confirmé : écritures passées au grand livre.');
    load();
  }

  return (
    <>
      <p className={c.note}>
        Paiement à la livraison : le livreur (ou Ozone) encaisse pour Wenna. Quand l'argent est récupéré, confirme-le ici avec
        le nom de celui qui le détient et, s'il les a retenus, ses frais de livraison. La vente, la commission et la part du
        vendeur sont alors écrites automatiquement.
      </p>
      <div className={a.card}>
        <div className={a.tableWrap}>
          <table className={a.table}>
            <thead><tr><th>Commande</th><th>Client</th><th>Statut</th><th className={c.right}>À encaisser</th><th></th></tr></thead>
            <tbody>
              {rows.length === 0 ? <tr><td colSpan={5} className={a.empty}>Aucun paiement à la livraison en attente.</td></tr> : rows.map((r) => {
                const ready = ['shipped', 'delivered'].includes(r.orders?.status);
                return (
                  <tr key={r.id}>
                    <td className={s.mono}>{shortId(r.order_id)}<br /><span className={c.muted}>{day(r.orders?.created_at)}</span></td>
                    <td>{r.orders?.shipping_name || '—'}<br /><span className={c.muted}>{[r.orders?.shipping_city, r.orders?.shipping_country].filter(Boolean).join(', ')}</span></td>
                    <td>{ORDER_STATUS[r.orders?.status] || r.orders?.status}</td>
                    <td className={c.right}><strong>{money(r.amount, r.currency)}</strong></td>
                    <td>{ready
                      ? <button className={`${a.btnPrimary} ${a.btnSm}`} onClick={() => { setOpen(r); setError(null); setForm({ holder: '', reference: '', fee: '' }); }}>Argent récupéré</button>
                      : <span className={c.muted}>Pas encore expédiée</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {open && (
        <Modal title={`Encaissement ${shortId(open.order_id)} — ${money(open.amount, open.currency)}`} onClose={() => setOpen(null)}>
          <div className={c.form}>
            <Field label="Qui a l'argent ? *"><HolderInput id="cod-holder" value={form.holder} onChange={(v) => setForm({ ...form, holder: v })} /></Field>
            <div className={c.row2}>
              <Field label={`Frais de livraison retenus (${curLabel(open.currency)})`}>
                <input className={a.input} inputMode="decimal" value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} placeholder="ex. 30" />
              </Field>
              <Field label="Référence (bordereau…)"><input className={a.input} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></Field>
            </div>
            <p className={c.muted}>Les frais sont enregistrés comme dépense « Livraison » payée par ce détenteur.</p>
            {error && <p className={s.err}>{error}</p>}
            <button className={a.btnPrimary} disabled={busy} onClick={confirm}>{busy ? 'Enregistrement…' : 'Confirmer l\'encaissement'}</button>
          </div>
        </Modal>
      )}
    </>
  );
}

// ═════════════ Grand livre ═════════════
const LEDGER_HEADERS = ['Date', 'Type', 'Source', 'Commande', 'Boutique', 'Chasseur', 'Montant', 'Devise', 'Moyen', 'Détenteur', 'Référence', 'Note', 'Créée le'];

function Livre({ shops, hunterNames, toast }) {
  const { from: f0, to: t0 } = monthRange(thisMonth());
  const [filters, setFilters] = useState({ from: f0, to: t0, type: '', shop: '' });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [adjust, setAdjust] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const query = useCallback((limit) => {
    let q = getSupabase().from('ledger_entries').select('*')
      .order('entry_date', { ascending: false }).order('created_at', { ascending: false }).limit(limit);
    if (filters.from) q = q.gte('entry_date', filters.from);
    if (filters.to) q = q.lte('entry_date', filters.to);
    if (filters.type) q = q.eq('type', filters.type);
    if (filters.shop) q = q.eq('shop_id', filters.shop);
    return q;
  }, [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await query(500);
    setRows(data || []);
    setLoading(false);
  }, [query]);
  useEffect(() => { load(); }, [load]);

  const toRow = (r) => [r.entry_date, TYPE_LABEL[r.type] || r.type, r.source, shortId(r.order_id), shops[r.shop_id] || shortId(r.shop_id),
    hunterNames[r.hunter_id] || shortId(r.hunter_id), Number(r.amount), curLabel(r.currency), METHOD_LABEL[r.payment_method] || '',
    r.collected_by || '', r.reference || '', r.notes || '', new Date(r.created_at).toLocaleString('fr-FR')];
  const period = `${filters.from || 'debut'}_${filters.to || 'fin'}`;

  async function exportCsv() {
    const { data } = await query(20000);
    downloadCsv(`wenna-grand-livre_${period}.csv`, LEDGER_HEADERS, (data || []).map(toRow));
  }

  async function exportXlsx() {
    const sb = getSupabase();
    const [{ data: entries }, { data: pnl }, { data: balances }, { data: expenses }, { data: hunters }] = await Promise.all([
      query(20000),
      sb.from('v_monthly_pnl').select('*').gte('month', (filters.from || '2000-01-01').slice(0, 7) + '-01').lte('month', filters.to || '2999-12-31').order('month'),
      sb.from('v_vendor_balances').select('*').order('shop_name'),
      sb.from('expenses').select('*').not('ledger_entry_id', 'is', null).gte('expense_date', filters.from || '2000-01-01').lte('expense_date', filters.to || '2999-12-31').order('expense_date'),
      sb.from('v_hunter_balances').select('*').order('hunter_name'),
    ]);
    downloadXlsx(`wenna-compta_${period}.xlsx`, [
      { name: 'Grand livre', headers: LEDGER_HEADERS, rows: (entries || []).map(toRow) },
      { name: 'Résultat', headers: ['Mois', 'Devise', 'Commissions', 'Marge de change', 'Revenu', 'Parrainage', 'Dépenses', 'Ajustements', 'Marge nette', 'GMV', 'Remboursements', 'Commandes'],
        rows: (pnl || []).map((p) => [p.month.slice(0, 7), curLabel(p.currency), Number(p.commissions), Number(p.fx_margin), Number(p.revenue), Number(p.referral_costs),
          Number(p.expenses), Number(p.adjustments), Number(p.net_margin), Number(p.gmv), Number(p.refunds), Number(p.orders_count)]) },
      { name: 'Soldes vendeurs', headers: ['Boutique', 'Devise', 'Dû', 'Reversé', 'Ajustements', 'Solde'],
        rows: (balances || []).map((b) => [b.shop_name || shortId(b.shop_id), curLabel(b.currency), Number(b.due), Number(b.paid), Number(b.adjustments), Number(b.balance)]) },
      { name: 'Soldes chasseurs', headers: ['Chasseur', 'Devise', 'Dû', 'Payé', 'Ajustements', 'Solde', 'Disponible'],
        rows: (hunters || []).map((h) => [h.hunter_name || shortId(h.hunter_id), curLabel(h.currency), Number(h.due), Number(h.paid), Number(h.adjustments), Number(h.balance), Number(h.available)]) },
      { name: 'Dépenses', headers: ['Date', 'Fournisseur', 'Catégorie', 'Montant', 'Devise', 'Payé par', 'Justificatif', 'Note'],
        rows: (expenses || []).map((e) => [e.expense_date, e.supplier, CATEGORY_LABEL[e.category] || e.category, Number(e.amount), curLabel(e.currency), e.paid_by || '', e.proof_path ? 'oui' : 'non', e.notes || '']) },
    ]);
  }

  async function saveAdjust() {
    setError(null);
    const amount = Number(String(adjust.amount).replace(',', '.'));
    if (!Number.isFinite(amount) || amount === 0) { setError('Montant invalide (négatif pour une diminution).'); return; }
    setBusy(true);
    const { error: e } = await getSupabase().rpc('add_ledger_adjustment', {
      p_amount: amount, p_currency: adjust.currency, p_notes: adjust.notes, p_date: adjust.date,
      p_shop_id: adjust.shop || null, p_hunter_id: null, p_collected_by: adjust.holder.trim() || null, p_reference: adjust.reference.trim() || null,
    });
    setBusy(false);
    if (e) { setError(errText(e)); return; }
    setAdjust(null);
    toast('Ajustement enregistré.');
    load();
  }

  const totals = rows.reduce((acc, r) => { const k = `${r.type}|${r.currency}`; acc[k] = (acc[k] || 0) + Number(r.amount); return acc; }, {});

  return (
    <>
      <div className={a.card}>
        <div className={c.filters}>
          <Field label="Du"><input type="date" className={a.input} value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></Field>
          <Field label="Au"><input type="date" className={a.input} value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></Field>
          <Field label="Type">
            <select className={a.input} value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
              <option value="">Tous</option>
              {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Vendeur">
            <select className={a.input} value={filters.shop} onChange={(e) => setFilters({ ...filters, shop: e.target.value })}>
              <option value="">Tous</option>
              {Object.entries(shops).sort((x, y) => x[1].localeCompare(y[1])).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </Field>
          <div className={c.actions}>
            <button className={`${a.btnGhost} ${a.btnSm}`} onClick={exportCsv}>Export CSV</button>
            <button className={`${a.btnGhost} ${a.btnSm}`} onClick={exportXlsx}>Export Excel</button>
            <button className={`${a.btnPrimary} ${a.btnSm}`} onClick={() => { setError(null); setAdjust({ amount: '', currency: 'MAD', notes: '', date: iso(new Date()), shop: '', holder: '', reference: '' }); }}>Correction</button>
          </div>
        </div>
        {Object.keys(totals).length > 0 && (
          <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)' }} className={c.muted}>
            {Object.entries(totals).map(([k, v]) => { const [t, cur] = k.split('|'); return `${TYPE_LABEL[t]} ${money(v, cur)}`; }).join(' · ')}
          </div>
        )}
        <div className={a.tableWrap}>
          <table className={a.table} data-testid="compta-ledger">
            <thead><tr><th>Date</th><th>Type</th><th>Commande</th><th>Boutique / chasseur</th><th className={c.right}>Montant</th><th>Détenteur</th><th>Référence</th></tr></thead>
            <tbody>
              {rows.length === 0 ? <tr><td colSpan={7} className={a.empty}>{loading ? 'Chargement…' : 'Aucune écriture sur cette période.'}</td></tr> : rows.map((r) => (
                <tr key={r.id}>
                  <td>{day(r.entry_date)}</td>
                  <td>{TYPE_LABEL[r.type] || r.type}{r.notes && <><br /><span className={c.muted}>{r.notes}</span></>}</td>
                  <td className={s.mono}>{shortId(r.order_id) || '—'}</td>
                  <td>{shops[r.shop_id] || hunterNames[r.hunter_id] || (r.shop_id || r.hunter_id ? shortId(r.shop_id || r.hunter_id) : '—')}</td>
                  <td className={`${c.right} ${Number(r.amount) < 0 ? c.neg : ''}`}>{money(r.amount, r.currency)}</td>
                  <td>{r.collected_by || '—'}{r.payment_method && <><br /><span className={c.muted}>{METHOD_LABEL[r.payment_method]}</span></>}</td>
                  <td>{r.reference || '—'}{r.proof_url && <><br /><button className={c.link} onClick={() => openProof(r.proof_url)}>Justificatif</button></>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 500 && <p className={c.muted} style={{ padding: '10px 18px' }}>500 premières lignes affichées : l'export contient toute la période.</p>}
      </div>
      {adjust && (
        <Modal title="Écriture de correction" onClose={() => setAdjust(null)}>
          <div className={c.form}>
            <p className={c.muted}>Le grand livre ne se modifie pas : une erreur se corrige par une écriture qui la compense (montant négatif pour diminuer).</p>
            <div className={c.row2}>
              <Field label="Montant *"><input className={a.input} inputMode="decimal" value={adjust.amount} onChange={(e) => setAdjust({ ...adjust, amount: e.target.value })} placeholder="ex. -150" /></Field>
              <Field label="Devise">
                <select className={a.input} value={adjust.currency} onChange={(e) => setAdjust({ ...adjust, currency: e.target.value })}>{CURRENCIES.map((x) => <option key={x} value={x}>{curLabel(x)}</option>)}</select>
              </Field>
            </div>
            <div className={c.row2}>
              <Field label="Date"><input type="date" className={a.input} value={adjust.date} onChange={(e) => setAdjust({ ...adjust, date: e.target.value })} /></Field>
              <Field label="Référence"><input className={a.input} value={adjust.reference} onChange={(e) => setAdjust({ ...adjust, reference: e.target.value })} /></Field>
            </div>
            <Field label="Vendeur concerné (change son solde)">
              <select className={a.input} value={adjust.shop} onChange={(e) => setAdjust({ ...adjust, shop: e.target.value })}>
                <option value="">Aucun</option>
                {Object.entries(shops).sort((x, y) => x[1].localeCompare(y[1])).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </Field>
            <Field label="Détenteur concerné (change sa caisse)"><HolderInput id="adj-holder" value={adjust.holder} onChange={(v) => setAdjust({ ...adjust, holder: v })} /></Field>
            <Field label="Explication *"><textarea className={a.input} value={adjust.notes} onChange={(e) => setAdjust({ ...adjust, notes: e.target.value })} /></Field>
            <p className={c.muted}>Sans vendeur ni détenteur, la correction compte dans la marge du mois.</p>
            {error && <p className={s.err}>{error}</p>}
            <button className={a.btnPrimary} disabled={busy} onClick={saveAdjust}>{busy ? 'Enregistrement…' : 'Enregistrer la correction'}</button>
          </div>
        </Modal>
      )}
    </>
  );
}

// ═════════════ Paiement (vendeur ou chasseur) ═════════════
function PayModal({ title, currency, defaultAmount, contact, onClose, onPay }) {
  const [form, setForm] = useState({ amount: String(defaultAmount || ''), method: 'virement', reference: '', from: 'Compte bancaire Maroc', notes: '' });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit() {
    setError(null);
    const amount = Number(String(form.amount).replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) { setError('Montant invalide.'); return; }
    if (!form.reference.trim()) { setError(ERRORS.reference_required); return; }
    setBusy(true);
    try {
      const proof = await uploadProof(file, 'reversements');
      await onPay({ amount, method: form.method, reference: form.reference.trim(), from: form.from.trim(), notes: form.notes.trim() || null, proof });
    } catch (e) {
      setError(errText(e));
      setBusy(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <div className={c.form}>
        {contact && <p className={c.muted}>Contact : {contact}</p>}
        <div className={c.row2}>
          <Field label={`Montant envoyé (${curLabel(currency)}) *`}><input className={a.input} inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
          <Field label="Moyen">
            <select className={a.input} value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
              <option value="virement">Virement</option><option value="mobile_money">Mobile Money</option><option value="autre">Autre</option>
            </select>
          </Field>
        </div>
        <div className={c.row2}>
          <Field label="Référence de l'envoi *"><input className={a.input} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></Field>
          <Field label="Payé depuis"><HolderInput id="pay-from" value={form.from} onChange={(v) => setForm({ ...form, from: v })} /></Field>
        </div>
        <Field label="Justificatif (image ou PDF)"><input type="file" className={a.input} accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} /></Field>
        <Field label="Note"><input className={a.input} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        {error && <p className={s.err}>{error}</p>}
        <button className={a.btnPrimary} disabled={busy} onClick={submit}>{busy ? 'Enregistrement…' : 'Marquer payé'}</button>
      </div>
    </Modal>
  );
}

// ═════════════ Reversements vendeurs ═════════════
function Reversements({ toast }) {
  const [balances, setBalances] = useState([]);
  const [pending, setPending] = useState([]);
  const [paid, setPaid] = useState([]);
  const [contacts, setContacts] = useState({});
  const [paying, setPaying] = useState(null);

  const load = useCallback(async () => {
    const sb = getSupabase();
    const [{ data: b }, { data: p }, { data: h }] = await Promise.all([
      sb.from('v_vendor_balances').select('*').order('balance', { ascending: false }),
      sb.from('vendor_payouts').select('*').eq('status', 'en_attente'),
      sb.from('vendor_payouts').select('*').eq('status', 'paye').order('paid_at', { ascending: false }).limit(50),
    ]);
    setBalances(b || []);
    setPending(p || []);
    setPaid(h || []);
    const ids = [...new Set((b || []).map((x) => x.shop_id))];
    if (ids.length) {
      const { data: sh } = await sb.from('shops').select('id,whatsapp,users:user_id(full_name,phone,email)').in('id', ids);
      setContacts(Object.fromEntries((sh || []).map((x) => [x.id, [x.users?.full_name, x.users?.phone || x.whatsapp, x.users?.email].filter(Boolean).join(' · ')])));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function prepare() {
    const { data, error } = await getSupabase().rpc('prepare_vendor_payouts', { p_period_end: iso(new Date()) });
    if (error) { toast(errText(error), true); return; }
    toast(data ? `${data} reversement(s) préparé(s).` : 'Rien de nouveau à préparer.');
    load();
  }

  async function pay(form) {
    const payout = pending.find((p) => p.shop_id === paying.shop_id && p.currency === paying.currency);
    const { error } = await getSupabase().rpc('pay_vendor', {
      p_shop_id: paying.shop_id, p_currency: paying.currency, p_amount: form.amount, p_method: form.method, p_reference: form.reference,
      p_collected_by: form.from || null, p_proof_url: form.proof, p_payout_id: payout?.id || null, p_notes: form.notes,
    });
    if (error) throw error;
    setPaying(null);
    toast('Reversement enregistré, le vendeur est notifié.');
    load();
  }

  const shown = balances.filter((b) => Number(b.balance) !== 0);
  const shopName = Object.fromEntries(balances.map((b) => [b.shop_id, b.shop_name]));

  return (
    <>
      <p className={c.note}>
        Le solde d'un vendeur = ses parts sur les ventes livrées et encaissées, moins ce qui lui a déjà été reversé. Envoie-lui
        le montant, puis « Marquer payé » avec la référence de l'envoi : l'écriture est créée et le vendeur est notifié.
      </p>
      <div className={a.card}>
        <div className={a.cardHead}>
          <span className={a.cardTitle}>À reverser</span>
          <button className={`${a.btnGhost} ${a.btnSm}`} onClick={prepare}>Préparer les reversements du jour</button>
        </div>
        <div className={a.tableWrap}>
          <table className={a.table} data-testid="compta-vendor-balances">
            <thead><tr><th>Boutique</th><th className={c.right}>Dû</th><th className={c.right}>Reversé</th><th className={c.right}>Solde</th><th>Préparé</th><th></th></tr></thead>
            <tbody>
              {shown.length === 0 ? <tr><td colSpan={6} className={a.empty}>Aucun vendeur à reverser.</td></tr> : shown.map((b) => {
                const p = pending.find((x) => x.shop_id === b.shop_id && x.currency === b.currency);
                return (
                  <tr key={`${b.shop_id}-${b.currency}`}>
                    <td>{b.shop_name || shortId(b.shop_id)}<br /><span className={c.muted}>{contacts[b.shop_id] || ''}</span></td>
                    <td className={c.right}>{money(b.due, b.currency)}</td>
                    <td className={c.right}>{money(b.paid, b.currency)}</td>
                    <td className={`${c.right} ${Number(b.balance) < 0 ? c.neg : ''}`}><strong>{money(b.balance, b.currency)}</strong></td>
                    <td>{p ? <span className={c.muted}>{money(p.amount_due, p.currency)} au {day(p.period_end)}</span> : '—'}</td>
                    <td>{Number(b.balance) > 0 && <button className={`${a.btnPrimary} ${a.btnSm}`} onClick={() => setPaying(b)}>Marquer payé</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className={a.card}>
        <div className={a.cardHead}><span className={a.cardTitle}>Derniers reversements</span></div>
        <div className={a.tableWrap}>
          <table className={a.table}>
            <thead><tr><th>Date</th><th>Boutique</th><th className={c.right}>Montant</th><th>Moyen</th><th>Référence</th></tr></thead>
            <tbody>
              {paid.length === 0 ? <tr><td colSpan={5} className={a.empty}>Aucun reversement pour l'instant.</td></tr> : paid.map((p) => (
                <tr key={p.id}>
                  <td>{day(p.paid_at)}</td>
                  <td>{shopName[p.shop_id] || shortId(p.shop_id)}</td>
                  <td className={c.right}>{money(p.amount_paid, p.currency)}</td>
                  <td>{METHOD_LABEL[p.method] || '—'}<br /><span className={c.muted}>{p.collected_by || ''}</span></td>
                  <td className={s.mono}>{p.reference}{p.proof_url && <><br /><button className={c.link} onClick={() => openProof(p.proof_url)}>Justificatif</button></>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {paying && (
        <PayModal title={`Reverser ${paying.shop_name || 'le vendeur'}`} currency={paying.currency} defaultAmount={paying.balance}
          contact={contacts[paying.shop_id]} onClose={() => setPaying(null)} onPay={pay} />
      )}
    </>
  );
}

// ═════════════ Dépenses ═════════════
function Depenses({ toast }) {
  const [month, setMonth] = useState(thisMonth());
  const [templates, setTemplates] = useState([]);
  const [recorded, setRecorded] = useState([]);
  const [amounts, setAmounts] = useState({});
  const [adding, setAdding] = useState(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    const sb = getSupabase();
    const { from, to } = monthRange(month);
    const [{ data: t }, { data: r }] = await Promise.all([
      sb.from('expenses').select('*').eq('is_recurring', true).is('template_id', null).is('ledger_entry_id', null).order('supplier'),
      sb.from('expenses').select('*').not('ledger_entry_id', 'is', null).gte('expense_date', from).lte('expense_date', to).order('expense_date', { ascending: false }),
    ]);
    setTemplates(t || []);
    setRecorded(r || []);
    setAmounts(Object.fromEntries((t || []).map((x) => [x.id, x.amount == null ? '' : String(x.amount)])));
  }, [month]);
  useEffect(() => { load(); }, [load]);

  async function saveTemplate(t, patch) {
    const { error: e } = await getSupabase().from('expenses').update(patch).eq('id', t.id);
    if (e) { toast(errText(e), true); return; }
    toast('Modèle mis à jour.');
    load();
  }

  async function recordTemplate(t) {
    const amount = Number(String(amounts[t.id] || '').replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) { toast('Renseigne le montant du mois.', true); return; }
    const { from, to } = monthRange(month);
    const today = iso(new Date());
    const date = today >= from && today <= to ? today : to;
    const { error: e } = await getSupabase().rpc('record_expense', {
      p_supplier: t.supplier, p_category: t.category, p_amount: amount, p_currency: t.currency, p_date: date,
      p_paid_by: t.paid_by || 'Compte bancaire Maroc', p_proof_path: null, p_notes: t.notes || null, p_template_id: t.id,
    });
    if (e) { toast(errText(e), true); return; }
    if (t.amount == null || Number(t.amount) !== amount) await getSupabase().from('expenses').update({ amount }).eq('id', t.id);
    toast(`${t.supplier} enregistré pour ${monthLabel(month)}.`);
    load();
  }

  async function submit() {
    setError(null);
    const amount = Number(String(adding.amount).replace(',', '.'));
    if (!adding.supplier.trim()) { setError(ERRORS.supplier_required); return; }
    if (!adding.template && (!Number.isFinite(amount) || amount <= 0)) { setError(ERRORS.invalid_amount); return; }
    setBusy(true);
    try {
      const sb = getSupabase();
      if (adding.template) {
        const { error: e } = await sb.from('expenses').insert({
          supplier: adding.supplier.trim(), category: adding.category, currency: adding.currency, is_recurring: true, recurrence: 'mensuel',
          amount: Number.isFinite(amount) && amount > 0 ? amount : null, paid_by: adding.paidBy.trim() || null, notes: adding.notes.trim() || null,
        });
        if (e) throw e;
      } else {
        const proof = await uploadProof(file, 'depenses');
        const { error: e } = await sb.rpc('record_expense', {
          p_supplier: adding.supplier.trim(), p_category: adding.category, p_amount: amount, p_currency: adding.currency, p_date: adding.date,
          p_paid_by: adding.paidBy.trim() || null, p_proof_path: proof, p_notes: adding.notes.trim() || null, p_template_id: null,
        });
        if (e) throw e;
      }
      setAdding(null);
      setFile(null);
      toast(adding.template ? 'Modèle ajouté.' : 'Dépense enregistrée au grand livre.');
      load();
    } catch (e) {
      setError(errText(e));
    }
    setBusy(false);
  }

  const done = new Set(recorded.map((r) => r.template_id).filter(Boolean));
  const totals = sumBy(recorded, 'currency', (r) => r.amount);
  const blank = (template) => ({ template, supplier: '', category: template ? 'outils_ia' : 'autre', amount: '', currency: template ? 'USD' : 'MAD', date: iso(new Date()), paidBy: 'Compte bancaire Maroc', notes: '' });

  return (
    <>
      <div className={c.filters} style={{ border: 'none', padding: '0 0 14px' }}>
        <label className={c.month}><span className={a.formLabel}>Mois</span>
          <input type="month" className={a.input} value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        </label>
        <div className={c.actions}>
          <button className={`${a.btnPrimary} ${a.btnSm}`} onClick={() => { setError(null); setFile(null); setAdding(blank(false)); }}>Ajouter une dépense</button>
          <button className={`${a.btnGhost} ${a.btnSm}`} onClick={() => { setError(null); setAdding(blank(true)); }}>Nouveau modèle mensuel</button>
        </div>
      </div>
      <div className={a.card}>
        <div className={a.cardHead}><span className={a.cardTitle}>Abonnements récurrents — {monthLabel(month)}</span></div>
        <div className={a.tableWrap}>
          <table className={a.table} data-testid="compta-templates">
            <thead><tr><th>Fournisseur</th><th>Catégorie</th><th>Montant du mois</th><th>Payé par</th><th></th></tr></thead>
            <tbody>
              {templates.length === 0 ? <tr><td colSpan={5} className={a.empty}>Aucun modèle.</td></tr> : templates.map((t) => (
                <tr key={t.id}>
                  <td><strong>{t.supplier}</strong>{t.amount == null && <><br /><span className={c.neg} style={{ fontSize: 11 }}>Montant à renseigner</span></>}</td>
                  <td>{CATEGORY_LABEL[t.category]}</td>
                  <td>
                    <input className={`${a.input} ${c.inlineInput}`} inputMode="decimal" value={amounts[t.id] ?? ''} placeholder="0"
                      onChange={(e) => setAmounts({ ...amounts, [t.id]: e.target.value })}
                      onBlur={() => { const v = Number(String(amounts[t.id]).replace(',', '.')); if (amounts[t.id] !== '' && Number.isFinite(v) && v >= 0 && v !== Number(t.amount)) saveTemplate(t, { amount: v }); }} />
                    {' '}{curLabel(t.currency)}
                  </td>
                  <td>{t.paid_by || 'Compte bancaire Maroc'}</td>
                  <td>{done.has(t.id)
                    ? <span className={c.pos}>Enregistrée</span>
                    : <button className={`${a.btnPrimary} ${a.btnSm}`} onClick={() => recordTemplate(t)}>Enregistrer pour ce mois</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className={a.card}>
        <div className={a.cardHead}>
          <span className={a.cardTitle}>Dépenses de {monthLabel(month)}</span>
          <span className={c.muted}>{Object.entries(totals).map(([cur, v]) => money(v, cur)).join(' · ')}</span>
        </div>
        <div className={a.tableWrap}>
          <table className={a.table}>
            <thead><tr><th>Date</th><th>Fournisseur</th><th>Catégorie</th><th className={c.right}>Montant</th><th>Payé par</th><th>Justificatif</th></tr></thead>
            <tbody>
              {recorded.length === 0 ? <tr><td colSpan={6} className={a.empty}>Aucune dépense ce mois-ci.</td></tr> : recorded.map((r) => (
                <tr key={r.id}>
                  <td>{day(r.expense_date)}</td>
                  <td>{r.supplier}{r.notes && <><br /><span className={c.muted}>{r.notes}</span></>}</td>
                  <td>{CATEGORY_LABEL[r.category]}</td>
                  <td className={c.right}>{money(r.amount, r.currency)}</td>
                  <td>{r.paid_by || '—'}</td>
                  <td>{r.proof_path ? <button className={c.link} onClick={() => openProof(r.proof_path)}>Voir</button> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {adding && (
        <Modal title={adding.template ? 'Nouveau modèle mensuel' : 'Nouvelle dépense'} onClose={() => setAdding(null)}>
          <div className={c.form}>
            <Field label="Fournisseur *"><input className={a.input} value={adding.supplier} onChange={(e) => setAdding({ ...adding, supplier: e.target.value })} placeholder="ex. Vercel, Ozone, Meta Ads" /></Field>
            <div className={c.row2}>
              <Field label="Catégorie">
                <select className={a.input} value={adding.category} onChange={(e) => setAdding({ ...adding, category: e.target.value })}>
                  {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="Devise">
                <select className={a.input} value={adding.currency} onChange={(e) => setAdding({ ...adding, currency: e.target.value })}>{CURRENCIES.map((x) => <option key={x} value={x}>{curLabel(x)}</option>)}</select>
              </Field>
            </div>
            <div className={c.row2}>
              <Field label={adding.template ? 'Montant habituel' : 'Montant *'}><input className={a.input} inputMode="decimal" value={adding.amount} onChange={(e) => setAdding({ ...adding, amount: e.target.value })} /></Field>
              {!adding.template && <Field label="Date"><input type="date" className={a.input} value={adding.date} onChange={(e) => setAdding({ ...adding, date: e.target.value })} /></Field>}
            </div>
            <Field label="Payé par (détenteur)"><HolderInput id="exp-paid" value={adding.paidBy} onChange={(v) => setAdding({ ...adding, paidBy: v })} /></Field>
            {!adding.template && (
              <Field label="Justificatif (image ou PDF)"><input type="file" className={a.input} accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} /></Field>
            )}
            <Field label="Note"><input className={a.input} value={adding.notes} onChange={(e) => setAdding({ ...adding, notes: e.target.value })} /></Field>
            {error && <p className={s.err}>{error}</p>}
            <button className={a.btnPrimary} disabled={busy} onClick={submit}>{busy ? 'Enregistrement…' : adding.template ? 'Ajouter le modèle' : 'Enregistrer la dépense'}</button>
          </div>
        </Modal>
      )}
    </>
  );
}

// ═════════════ Chasseurs ═════════════
function Chasseurs({ toast }) {
  const [rows, setRows] = useState([]);
  const [paying, setPaying] = useState(null);

  const load = useCallback(async () => {
    const { data } = await getSupabase().from('v_hunter_balances').select('*').order('balance', { ascending: false });
    setRows(data || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function pay(form) {
    const { error } = await getSupabase().rpc('pay_hunter', {
      p_hunter_id: paying.hunter_id, p_currency: paying.currency, p_amount: form.amount, p_method: form.method,
      p_reference: form.reference, p_collected_by: form.from || null, p_proof_url: form.proof, p_notes: form.notes,
    });
    if (error) throw error;
    setPaying(null);
    toast('Paiement enregistré, le chasseur est notifié.');
    load();
  }

  return (
    <>
      <p className={c.note}>
        Parrainage : 20 % de la commission des boutiques recrutées pendant 6 mois, plus la prime d'activation, disponibles
        après le délai de blocage. Quêtes : la récompense moins 10 %, disponible dès la livraison.
      </p>
      <div className={a.card}>
        <div className={a.tableWrap}>
          <table className={a.table} data-testid="compta-hunters">
            <thead><tr><th>Chasseur</th><th className={c.right}>Gagné</th><th className={c.right}>Payé</th><th className={c.right}>Solde</th><th className={c.right}>Disponible</th><th></th></tr></thead>
            <tbody>
              {rows.length === 0 ? <tr><td colSpan={6} className={a.empty}>Aucun gain de chasseur pour l'instant.</td></tr> : rows.map((h) => (
                <tr key={`${h.hunter_id}-${h.currency}`}>
                  <td>{h.hunter_name || shortId(h.hunter_id)}</td>
                  <td className={c.right}>{money(h.due, h.currency)}</td>
                  <td className={c.right}>{money(h.paid, h.currency)}</td>
                  <td className={c.right}>{money(h.balance, h.currency)}</td>
                  <td className={c.right}><strong>{money(h.available, h.currency)}</strong></td>
                  <td>{Number(h.available) > 0 && <button className={`${a.btnPrimary} ${a.btnSm}`} onClick={() => setPaying(h)}>Marquer payé</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {paying && (
        <PayModal title={`Payer ${paying.hunter_name || 'le chasseur'}`} currency={paying.currency} defaultAmount={paying.available}
          onClose={() => setPaying(null)} onPay={pay} />
      )}
    </>
  );
}

// ═════════════ Caisse ═════════════
function Caisse({ toast }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ from: 'Ozone', to: 'Compte bancaire Maroc', amount: '', currency: 'MAD', reference: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    const { data } = await getSupabase().from('v_cash_position').select('*').order('collected_by');
    setRows(data || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function transfer() {
    setError(null);
    const amount = Number(String(form.amount).replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) { setError(ERRORS.invalid_amount); return; }
    setBusy(true);
    const { error: e } = await getSupabase().rpc('transfer_funds', {
      p_from: form.from.trim(), p_to: form.to.trim(), p_amount: amount, p_currency: form.currency, p_reference: form.reference.trim() || null, p_notes: null,
    });
    setBusy(false);
    if (e) { setError(errText(e)); return; }
    setForm({ ...form, amount: '', reference: '' });
    toast('Remise de fonds enregistrée.');
    load();
  }

  return (
    <>
      <p className={c.note}>
        Qui détient l'argent de Wenna. Un livreur ou Ozone qui a encaissé doit le remettre : quand le virement arrive sur le RIB
        (ou que les espèces sont remises), enregistre la remise de fonds ci-dessous.
      </p>
      <div className={a.card}>
        <div className={a.tableWrap}>
          <table className={a.table} data-testid="compta-cash">
            <thead><tr><th>Détenteur</th><th className={c.right}>Solde</th><th>Dernier mouvement</th></tr></thead>
            <tbody>
              {rows.length === 0 ? <tr><td colSpan={3} className={a.empty}>Aucun mouvement de caisse.</td></tr> : rows.map((r) => (
                <tr key={`${r.collected_by}-${r.currency}`}>
                  <td>{r.collected_by}{!WENNA_ACCOUNTS.includes(r.collected_by) && Number(r.balance) > 0 && <><br /><span className={c.muted}>À récupérer</span></>}</td>
                  <td className={`${c.right} ${Number(r.balance) < 0 ? c.neg : ''}`}><strong>{money(r.balance, r.currency)}</strong></td>
                  <td>{day(r.last_movement)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className={a.card}>
        <div className={a.cardHead}><span className={a.cardTitle}>Remise de fonds</span></div>
        <div className={c.form}>
          <div className={c.row2}>
            <Field label="De"><HolderInput id="tr-from" value={form.from} onChange={(v) => setForm({ ...form, from: v })} /></Field>
            <Field label="Vers"><HolderInput id="tr-to" value={form.to} onChange={(v) => setForm({ ...form, to: v })} /></Field>
          </div>
          <div className={c.row2}>
            <Field label="Montant *"><input className={a.input} inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
            <Field label="Devise">
              <select className={a.input} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>{CURRENCIES.map((x) => <option key={x} value={x}>{curLabel(x)}</option>)}</select>
            </Field>
          </div>
          <Field label="Référence (n° de virement…)"><input className={a.input} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></Field>
          {error && <p className={s.err}>{error}</p>}
          <button className={a.btnPrimary} disabled={busy} onClick={transfer}>{busy ? 'Enregistrement…' : 'Enregistrer la remise'}</button>
        </div>
      </div>
    </>
  );
}

// ═════════════ Page ═════════════
function Compta() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'tableau';
  const [access, setAccess] = useState('checking');
  const [month, setMonth] = useState(thisMonth());
  const [shops, setShops] = useState({});
  const [hunterNames, setHunterNames] = useState({});
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    (async () => {
      const sb = getSupabase();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { setAccess('login'); return; }
      const { data } = await sb.from('users').select('role').eq('auth_id', session.user.id).maybeSingle();
      setAccess(data?.role === 'admin' ? 'ok' : 'denied');
    })();
  }, []);

  useEffect(() => {
    if (access !== 'ok') return;
    const sb = getSupabase();
    sb.from('shops').select('id,name').order('name').then(({ data }) => setShops(Object.fromEntries((data || []).map((x) => [x.id, x.name]))));
    sb.from('v_hunter_balances').select('hunter_id,hunter_name').then(({ data }) => setHunterNames(Object.fromEntries((data || []).map((x) => [x.hunter_id, x.hunter_name]))));
  }, [access]);

  const toast = useCallback((text, isError = false) => {
    setMsg({ text, isError });
    setTimeout(() => setMsg(null), 3500);
  }, []);

  const content = useMemo(() => {
    switch (tab) {
      case 'encaissements': return <Encaissements toast={toast} />;
      case 'livre': return <Livre shops={shops} hunterNames={hunterNames} toast={toast} />;
      case 'reversements': return <Reversements toast={toast} />;
      case 'depenses': return <Depenses toast={toast} />;
      case 'chasseurs': return <Chasseurs toast={toast} />;
      case 'caisse': return <Caisse toast={toast} />;
      default: return <Dashboard month={month} setMonth={setMonth} />;
    }
  }, [tab, toast, shops, hunterNames, month]);

  if (access === 'checking') return <div className={s.page}>Chargement…</div>;
  if (access === 'login') return <div className={s.page}><p>Connecte-toi avec un compte administrateur.</p><Link href="/connexion?next=/admin/compta" className={a.btnPrimary}>Se connecter</Link></div>;
  if (access === 'denied') return <div className={s.page}><p>Accès réservé aux administrateurs.</p></div>;

  return (
    <div className={s.page}>
      <div className={s.head}>
        <h1 className={s.title}>Comptabilité</h1>
        <Link href="/admin" className={s.back}>Retour à l'admin</Link>
      </div>
      <div className={s.tabs}>
        {TABS.map(([k, label]) => (
          <button key={k} data-testid={`compta-tab-${k}`} className={`${s.tab} ${tab === k ? s.tabActive : ''}`}
            onClick={() => router.replace(k === 'tableau' ? '/admin/compta' : `/admin/compta?tab=${k}`, { scroll: false })}>{label}</button>
        ))}
      </div>
      {content}
      {msg && <div className={`${a.toast} ${msg.isError ? a.toastError : ''}`}>{msg.text}</div>}
    </div>
  );
}

export default function ComptaPage() {
  return <Suspense fallback={null}><Compta /></Suspense>;
}
