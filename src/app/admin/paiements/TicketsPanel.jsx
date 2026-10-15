'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { questProofCode } from '@/lib/questRules';
import a from '../admin.module.css';
import s from '../staff.module.css';

// Tickets de caisse des chasseurs (avance du prix du produit).
// Lecture : purchase_proof_queue ; action : review_purchase_proof. Contrôlé en base.

const TABS = [
  ['pending', 'À vérifier'],
  ['overdue', 'Colis en retard'],
  ['approved', 'Validés'],
  ['rejected', 'Refusés'],
];
const REJECT_REASONS = [
  'Ticket illisible',
  'Code de la quête absent de la photo',
  'Montant ou date du ticket incohérents',
  "Produit différent de l'offre",
  'Autre',
];
const ERRORS = {
  not_pending: "Ce ticket n'est plus en attente (déjà traité ?).",
  reason_required: 'Indique un motif de refus.',
  forbidden: 'Action non autorisée (un agent ne vérifie pas son propre ticket).',
  order_not_active: "La commande n'est plus en cours (livrée, annulée ou retournée) : refuse le ticket.",
  order_not_paid: "Le paiement de l'acheteur n'est pas validé.",
};

const money = (n, c) => `${Number(n || 0).toLocaleString('fr-FR')} ${c === 'XAF' || c === 'XOF' || c === 'FCFA' ? 'FCFA' : c}`;
const when = (d) => (d ? new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

function Proof({ path, label }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    getSupabase().storage.from('quest-proofs').createSignedUrl(path, 600).then(({ data }) => setUrl(data?.signedUrl || null));
  }, [path]);
  if (!url) return <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Chargement…</span>;
  return /\.pdf$/i.test(path)
    ? <a href={url} target="_blank" rel="noreferrer" className={a.btnGhost}>Ouvrir le PDF ({label})</a>
    : <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={label} className={s.proof} /></a>;
}

function Detail({ t, onClose, onDone }) {
  const [reason, setReason] = useState(REJECT_REASONS[0]);
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const code = questProofCode(t.proposal_id);

  async function act(action) {
    setError(null);
    let r = null;
    if (action === 'reject') {
      r = reason === 'Autre' ? other.trim() : reason;
      if (!r) { setError('Précise le motif.'); return; }
    } else if (!confirm(`Valider l'avance de ${money(t.advance_amount, t.currency)} ? Elle pourra être versée au chasseur tout de suite.`)) {
      return;
    }
    setBusy(true);
    const { error: e } = await getSupabase().rpc('review_purchase_proof', { p_proof_id: t.id, p_action: action, p_reason: r });
    setBusy(false);
    if (e) { setError(ERRORS[e.message] || e.message); return; }
    onDone();
  }

  const gap = Number(t.proposed_price) - Number(t.advance_amount);

  return (
    <div className={s.panelOv} onClick={onClose}>
      <div className={s.panel} onClick={(e) => e.stopPropagation()} data-testid="ticket-detail">
        <div className={s.panelHead}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>{t.quest_title || 'Quête'}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Code attendu sur la photo : <span className={s.mono}>{code}</span></div>
          </div>
          <button className={s.close} onClick={onClose}>Fermer</button>
        </div>

        <dl className={s.dl}>
          <dt>Chasseur</dt><dd>{t.hunter_name || '—'}{t.hunter_phone ? ` · ${t.hunter_phone}` : ''}</dd>
          <dt>Quêtes livrées</dt><dd>{t.delivered_count}</dd>
          <dt>Prix de l'offre</dt><dd>{money(t.proposed_price, t.currency)}</dd>
          <dt>Montant du ticket</dt><dd>{money(t.receipt_amount, t.currency)}</dd>
          <dt>Avance</dt><dd><strong>{money(t.advance_amount, t.currency)}</strong>{gap > 0 ? ` · écart de ${money(gap, t.currency)} rendu à l'acheteur à la livraison` : ''}</dd>
          <dt>Avances en cours</dt><dd>{money(t.outstanding_xaf, 'XAF')} (plafond 150 000 FCFA)</dd>
          <dt>Commande</dt><dd className={s.mono}>{t.order_ref} · {t.order_status}</dd>
          <dt>Envoyé le</dt><dd>{when(t.created_at)}</dd>
          {t.handover_deadline && <><dt>Remise au transport</dt><dd>{t.handed_over_at ? `faite le ${when(t.handed_over_at)}` : `avant le ${when(t.handover_deadline)}`}</dd></>}
          {t.reject_reason && <><dt>Motif du refus</dt><dd>{t.reject_reason}</dd></>}
        </dl>

        <div className={s.section}>
          <div className={s.sectionTitle}>Ticket de caisse</div>
          <Proof path={t.receipt_path} label="ticket" />
        </div>
        <div className={s.section}>
          <div className={s.sectionTitle}>Produit avec le code</div>
          <Proof path={t.photo_path} label="produit" />
        </div>

        {t.status === 'pending' && (
          <div className={s.section}>
            <div className={s.sectionTitle}>À vérifier</div>
            <ul className={s.history}>
              <li>Le magasin et la date du ticket sont lisibles, la date est après le paiement de l'acheteur.</li>
              <li>Le montant du ticket correspond au produit de l'offre.</li>
              <li>Le code {code} est écrit à la main à côté du produit.</li>
              <li>Le produit ressemble à celui de l'offre (couleur, taille, marque).</li>
            </ul>
            <div className={s.actions}>
              <button className={a.btnPrimary} disabled={busy} onClick={() => act('approve')}>Valider l'avance</button>
            </div>
            <div className={s.sectionTitle} style={{ marginTop: 18 }}>Refuser</div>
            <select className={a.input} aria-label="Motif du refus" value={reason} onChange={(e) => setReason(e.target.value)}>
              {REJECT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            {reason === 'Autre' && <input className={a.input} style={{ marginTop: 8 }} placeholder="Motif (visible par le chasseur)" value={other} onChange={(e) => setOther(e.target.value)} />}
            <div className={s.actions}>
              <button className={a.btnDanger} disabled={busy} onClick={() => act('reject')}>Refuser</button>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 8 }}>Refuser ne bloque pas la quête : le chasseur peut renvoyer un ticket, ou être payé à la livraison.</p>
          </div>
        )}
        {error && <p className={s.err}>{error}</p>}
      </div>
    </div>
  );
}

export default function TicketsPanel({ onCount }) {
  const [tab, setTab] = useState('pending');
  const [rows, setRows] = useState({});
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    const sb = getSupabase();
    const results = await Promise.all(TABS.map(([k]) => sb.rpc('purchase_proof_queue', { p_status: k, p_limit: 200 })));
    const byTab = Object.fromEntries(TABS.map(([k], i) => [k, results[i].data || []]));
    setRows(byTab);
    onCount?.(byTab.pending.length + byTab.overdue.length);
  }, [onCount]);

  useEffect(() => {
    load();
    const sb = getSupabase();
    const channel = sb.channel('staff-quest-proofs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quest_purchase_proofs' }, () => load())
      .subscribe();
    const poll = setInterval(load, 60000);
    return () => { sb.removeChannel(channel); clearInterval(poll); };
  }, [load]);

  const list = rows[tab] || [];

  return (
    <>
      <div className={s.tabs} role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`${s.tab} ${tab === k ? s.tabActive : ''}`} onClick={() => setTab(k)}>
            {label}<span className={s.count}>{(rows[k] || []).length}</span>
          </button>
        ))}
      </div>
      <div className={a.card} data-testid="tickets-table">
        <div className={a.tableWrap}>
          <table className={a.table}>
            <thead><tr><th>Code</th><th>Quête</th><th>Chasseur</th><th>Ticket</th><th>Avance</th><th>Livrées</th><th>{tab === 'pending' ? 'Envoyé' : 'Remise avant'}</th></tr></thead>
            <tbody>
              {list.length === 0 ? (
                <tr><td colSpan={7} className={a.empty}>Rien ici pour l'instant.</td></tr>
              ) : list.map((t) => (
                <tr key={t.id} className={s.rowBtn} onClick={() => setSelected(t)}>
                  <td className={s.mono}>{questProofCode(t.proposal_id)}</td>
                  <td>{t.quest_title || '—'}</td>
                  <td>{t.hunter_name || '—'}</td>
                  <td>{money(t.receipt_amount, t.currency)}</td>
                  <td>{money(t.advance_amount, t.currency)}</td>
                  <td>{t.delivered_count}</td>
                  <td className={tab === 'overdue' ? s.late : ''}>
                    {tab === 'pending' ? when(t.created_at) : t.handed_over_at ? `remis le ${when(t.handed_over_at)}` : when(t.handover_deadline)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>
        Une avance validée apparaît dans Comptabilité, onglet Chasseurs, comme montant disponible : verse-la depuis cet onglet.
      </p>
      {selected && <Detail t={selected} onClose={() => setSelected(null)} onDone={async () => { setSelected(null); await load(); }} />}
    </>
  );
}
