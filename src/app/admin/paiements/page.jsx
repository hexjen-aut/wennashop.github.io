'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { tourStepsFor } from '@/lib/tourSteps';
import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';
import TourOverlay from '@/components/TourOverlay';
import tourStyles from '@/components/TourOverlay.module.css';
import AdminGuide from '../AdminGuide';
import { AGENT_TOUR_STEPS } from '../guide';
import TicketsPanel from './TicketsPanel';
import a from '../admin.module.css';
import s from '../staff.module.css';

// Vérification des paiements manuels (admin + agents de paiement).
// Lecture : payment_queue / payment_review_history ; actions : review_payment.
// Tout est contrôlé en base (is_payment_staff), cette page n'est qu'un écran.

const TABS = [
  ['declared', 'À vérifier'],
  ['awaiting_payment', 'En attente client'],
  ['validated', 'Validés'],
  ['rejected', 'Refusés'],
];
const METHOD_LABEL = { airtel_money: 'Airtel Money', moov_money: 'Moov Money', virement: 'Virement' };
const REJECT_REASONS = ['Transaction introuvable', 'Montant incorrect', 'Transaction déjà utilisée', 'Autre'];
const REVIEW_ERRORS = {
  amount_short: 'Montant reçu inférieur au montant attendu : refuse avec le motif « Montant incorrect ».',
  not_declared: "Ce paiement n'est plus en attente de vérification (déjà traité ?).",
  reason_required: 'Indique un motif de refus.',
  forbidden: "Action non autorisée (un agent ne vérifie pas son propre paiement).",
};
const ACTION_LABEL = { validate: 'Validé', reject: 'Refusé', hold: 'Mis en attente' };

const money = (n, c) => `${Number(n || 0).toLocaleString('fr-FR')} ${c === 'XAF' || c === 'XOF' ? 'FCFA' : c}`;
const when = (d) => (d ? new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const hoursSince = (d) => (d ? (Date.now() - new Date(d).getTime()) / 3600000 : 0);

function Detail({ p, onClose, onDone }) {
  const [history, setHistory] = useState([]);
  const [proofUrl, setProofUrl] = useState(null);
  const [amount, setAmount] = useState(String(p.amount));
  const [reason, setReason] = useState(REJECT_REASONS[0]);
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const sb = getSupabase();
    sb.rpc('payment_review_history', { p_payment_id: p.id }).then(({ data }) => setHistory(data || []));
    if (p.proof_path) {
      sb.storage.from('payment-proofs').createSignedUrl(p.proof_path, 600).then(({ data }) => setProofUrl(data?.signedUrl || null));
    }
  }, [p.id, p.proof_path]);

  async function act(action) {
    setError(null);
    const sb = getSupabase();
    let args = { p_payment_id: p.id, p_action: action, p_amount_received: null, p_reason: null };
    if (action === 'validate') {
      const v = Number(amount);
      if (!(v > 0)) { setError('Indique le montant réellement reçu.'); return; }
      if (v !== Number(p.amount) && !confirm(`Montant reçu (${money(v, p.currency)}) différent du montant attendu (${money(p.amount, p.currency)}). Valider quand même ?`)) return;
      args.p_amount_received = v;
    }
    if (action === 'reject') {
      const r = reason === 'Autre' ? other.trim() : reason;
      if (!r) { setError('Précise le motif.'); return; }
      args.p_reason = r;
    }
    if (action === 'hold') {
      const r = prompt('Pourquoi mettre en attente ? (visible dans l\'historique)') ;
      if (r === null) return;
      args.p_reason = r || null;
    }
    setBusy(true);
    const { error: e } = await sb.rpc('review_payment', args);
    setBusy(false);
    if (e) { setError(REVIEW_ERRORS[e.message] || e.message); return; }
    onDone();
  }

  const declared = p.verification_status === 'declared';
  const diff = Number(amount) !== Number(p.amount);

  return (
    <div className={s.panelOv} onClick={onClose}>
      <div className={s.panel} onClick={(e) => e.stopPropagation()} data-testid="payment-detail">
        <div className={s.panelHead}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900 }} className={s.mono}>{p.reference}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{METHOD_LABEL[p.method] || p.method}{p.on_hold ? ' · en attente' : ''}</div>
          </div>
          <button className={s.close} onClick={onClose}><i className="ph ph-x" aria-hidden="true" />Fermer</button>
        </div>

        <dl className={s.dl}>
          <dt>Montant attendu</dt><dd>{money(p.amount, p.currency)}</dd>
          {p.amount_received != null && <><dt>Montant reçu</dt><dd>{money(p.amount_received, p.currency)}</dd></>}
          <dt>ID transaction</dt><dd className={s.mono}>{p.transaction_id || '—'}</dd>
          <dt>Numéro émetteur</dt><dd>{p.sender_number || '—'}</dd>
          <dt>Déclaré le</dt><dd>{when(p.declared_at)}</dd>
          <dt>Client</dt><dd>{p.buyer_name || '—'}<br /><span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>{p.buyer_email} {p.buyer_phone ? `· ${p.buyer_phone}` : ''}</span></dd>
          <dt>Commande</dt><dd className={s.mono}>{String(p.order_id).slice(0, 8).toUpperCase()} · {p.order_status}</dd>
          <dt>Boutique</dt><dd>{p.shop_name || '—'} · {p.shipping_country || '—'}</dd>
          {p.reject_reason && <><dt>Dernier refus</dt><dd>{p.reject_reason}</dd></>}
        </dl>

        {p.proof_path && (
          <div className={s.section}>
            <div className={s.sectionTitle}>Capture</div>
            {proofUrl ? (/\.pdf$/i.test(p.proof_path)
              ? <a href={proofUrl} target="_blank" rel="noreferrer" className={a.btnGhost}>Ouvrir le PDF</a>
              : <a href={proofUrl} target="_blank" rel="noreferrer"><img src={proofUrl} alt="Capture du paiement" className={s.proof} /></a>)
              : <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Chargement…</span>}
          </div>
        )}

        {declared && (
          <div className={s.section}>
            <div className={s.sectionTitle}>Valider</div>
            <label className={a.formLabel} htmlFor="received">Montant reçu ({p.currency === 'XAF' || p.currency === 'XOF' ? 'FCFA' : p.currency})</label>
            <input id="received" className={a.input} type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            {diff && <p className={s.warn}>Différent du montant attendu ({money(p.amount, p.currency)}).</p>}
            <div className={s.actions}>
              <button className={a.btnPrimary} disabled={busy} onClick={() => act('validate')}>Valider le paiement</button>
              <button className={a.btnGhost} disabled={busy} onClick={() => act('hold')}>Mettre en attente</button>
            </div>

            <div className={s.sectionTitle} style={{ marginTop: 18 }}>Refuser</div>
            <select className={a.input} aria-label="Motif du refus" value={reason} onChange={(e) => setReason(e.target.value)}>
              {REJECT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            {reason === 'Autre' && <input className={a.input} style={{ marginTop: 8 }} placeholder="Motif (visible par le client)" value={other} onChange={(e) => setOther(e.target.value)} />}
            <div className={s.actions}>
              <button className={a.btnDanger} disabled={busy} onClick={() => act('reject')}>Refuser</button>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 8 }}>Refuser renvoie le client sur sa page de paiement avec le motif ; il a 12 h de plus pour redéclarer.</p>
          </div>
        )}
        {error && <p className={s.err}>{error}</p>}

        <div className={s.section}>
          <div className={s.sectionTitle}>Historique</div>
          {history.length === 0 ? <p className={s.history}>Aucune revue pour l'instant.</p> : (
            <ul className={s.history}>
              {history.map((h, i) => (
                <li key={i}><strong>{ACTION_LABEL[h.action] || h.action}</strong> · {when(h.created_at)} · {h.agent_name || '—'}
                  {h.transaction_id ? ` · ID ${h.transaction_id}` : ''}{h.amount_received != null ? ` · reçu ${money(h.amount_received, p.currency)}` : ''}{h.reason ? ` — ${h.reason}` : ''}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function PaiementsAgent() {
  const params = useSearchParams();
  const [access, setAccess] = useState('checking'); // checking | denied | ok | login
  const [tab, setTab] = useState('declared');
  // Paiements des clients ou tickets de caisse des chasseurs (?tab=tickets)
  const [view, setView] = useState(params.get('tab') === 'tickets' ? 'tickets' : 'payments');
  const [ticketCount, setTicketCount] = useState(0);
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  const [summary, setSummary] = useState([]);
  const [selected, setSelected] = useState(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [me, setMe] = useState(null);
  const [tourStep, setTourStep] = useState(null);
  // Étapes affichées : tout au premier passage, seulement les nouveautés ensuite.
  const [tourSteps, setTourSteps] = useState(AGENT_TOUR_STEPS);

  useEffect(() => {
    (async () => {
      const sb = getSupabase();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { setAccess('login'); return; }
      const { data } = await sb.rpc('is_payment_staff');
      setAccess(data === true ? 'ok' : 'denied');
      if (data !== true) return;
      // Visite guidée au premier passage sur cette page
      const { data: u } = await sb.from('users').select('id, agent_tour_completed_at').eq('auth_id', session.user.id).maybeSingle();
      setMe(u);
      const pending = u ? tourStepsFor(AGENT_TOUR_STEPS, u.agent_tour_completed_at) : [];
      if (pending.length && !params.get('id')) { setTourSteps(pending); setTourStep(0); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tourStep === null) return;
    // Les étapes visent la vue « Paiements clients ».
    setView('payments');
    document.getElementById(tourSteps[tourStep]?.targetId)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [tourStep, tourSteps]);

  function endTour() {
    setTourStep(null);
    if (!me?.id) return;
    const now = new Date().toISOString();
    // .then() : la requête Supabase ne part que lorsqu'on l'attend
    getSupabase().from('users').update({ agent_tour_completed_at: now }).eq('id', me.id).then(() => {});
    setMe((prev) => ({ ...prev, agent_tour_completed_at: now }));
  }
  function nextTourStep() {
    if (tourStep < tourSteps.length - 1) setTourStep(tourStep + 1);
    else endTour();
  }
  function tourHl(id) { return tourStep !== null && tourSteps[tourStep]?.targetId === id ? tourStyles.tourHighlight : ''; }

  const load = useCallback(async () => {
    const sb = getSupabase();
    const results = await Promise.all(TABS.map(([k]) => sb.rpc('payment_queue', { p_status: k, p_limit: 200 })));
    const byTab = Object.fromEntries(TABS.map(([k], i) => [k, results[i].data || []]));
    setCounts(Object.fromEntries(TABS.map(([k]) => [k, byTab[k].length])));
    // « Refusés » : en attente du client avec un motif ; on ne les répète pas dans « En attente client »
    byTab.awaiting_payment = byTab.awaiting_payment.filter((r) => !r.reject_reason);
    setRows(byTab);
    const { data: sum } = await sb.rpc('payment_daily_summary', {});
    setSummary(sum || []);
    return byTab;
  }, []);

  useEffect(() => {
    if (access !== 'ok') return;
    load().then((byTab) => {
      const id = params.get('id');
      if (id) setSelected(Object.values(byTab).flat().find((r) => r.id === id) || null);
    });
    const sb = getSupabase();
    const channel = sb.channel('staff-payments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => load())
      .subscribe();
    const poll = setInterval(load, 60000);
    return () => { sb.removeChannel(channel); clearInterval(poll); };
  }, [access, load, params]);

  if (access === 'checking') return <div className={s.page}>Chargement…</div>;
  if (access === 'login') return <div className={s.page}><p>Connecte-toi avec un compte de l'équipe.</p><Link href="/connexion?next=/admin/paiements" className={a.btnPrimary}>Se connecter</Link></div>;
  if (access === 'denied') return <div className={s.page}><p>Accès réservé aux administrateurs et aux agents de paiement.</p></div>;

  const list = rows[tab] || [];
  const lateCount = (rows.declared || []).filter((r) => hoursSince(r.declared_at) > 2).length;

  return (
    <div className={s.page}>
      <div className={s.head}>
        <h1 className={s.title}>Vérification des paiements</h1>
        <div className={s.headActions}>
          <button id="tour-agent-guide" className={`${s.guideBtn} ${tourHl('tour-agent-guide')}`} onClick={() => setGuideOpen(true)}>Guide</button>
          <Link href="/admin" className={s.back}>Retour à l'admin</Link>
        </div>
      </div>

      <div id="tour-agent-views" className={`${s.tabs} ${tourHl('tour-agent-views')}`} role="tablist" aria-label="Type de vérification">
        <button role="tab" aria-selected={view === 'payments'} className={`${s.tab} ${view === 'payments' ? s.tabActive : ''}`} onClick={() => setView('payments')}>
          Paiements clients<span className={s.count}>{counts.declared ?? 0}</span>
        </button>
        <button role="tab" aria-selected={view === 'tickets'} className={`${s.tab} ${view === 'tickets' ? s.tabActive : ''}`} onClick={() => setView('tickets')} data-testid="view-tickets">
          Tickets chasseurs<span className={s.count}>{ticketCount}</span>
        </button>
      </div>

      {view === 'tickets' ? <TicketsPanel onCount={setTicketCount} /> : <>
      {lateCount > 0 && (
        <div className={a.card} style={{ padding: '12px 14px', borderColor: 'var(--error)' }} data-testid="late-alert">
          <span className={s.late}>{lateCount} paiement{lateCount > 1 ? 's' : ''} déclaré{lateCount > 1 ? 's' : ''} depuis plus de 2 h</span> — à traiter en priorité.
        </div>
      )}

      <div id="tour-agent-tabs" className={`${s.tabs} ${tourHl('tour-agent-tabs')}`} role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`${s.tab} ${tab === k ? s.tabActive : ''}`} onClick={() => setTab(k)}>
            {label}<span className={s.count}>{k === 'awaiting_payment' ? (rows.awaiting_payment || []).length : counts[k] ?? 0}</span>
          </button>
        ))}
      </div>

      <div id="tour-agent-table" className={`${a.card} ${tourHl('tour-agent-table')}`}>
        <div className={a.tableWrap}>
          <table className={a.table}>
            <thead><tr><th>Référence</th><th>Moyen</th><th>Montant</th><th>ID transaction</th><th>Client</th><th>{tab === 'validated' ? 'Validé le' : tab === 'declared' ? 'Déclaré' : 'Expire le'}</th></tr></thead>
            <tbody>
              {list.length === 0 ? (
                <tr><td colSpan={6} className={a.empty}>Rien ici pour l'instant.</td></tr>
              ) : list.map((r) => {
                const late = tab === 'declared' && hoursSince(r.declared_at) > 2;
                return (
                  <tr key={r.id} className={s.rowBtn} onClick={() => setSelected(r)}>
                    <td className={s.mono}>{r.reference}{r.on_hold && <span className={s.hold}> · attente</span>}</td>
                    <td>{METHOD_LABEL[r.method] || r.method}</td>
                    <td>{money(r.amount, r.currency)}</td>
                    <td className={s.mono}>{r.transaction_id || (r.reject_reason ? <span style={{ color: 'var(--text-faint)' }}>{r.reject_reason}</span> : '—')}</td>
                    <td>{r.buyer_name || '—'}</td>
                    <td className={late ? s.late : ''}>
                      {tab === 'validated' ? when(r.validated_at) : tab === 'declared' ? `${when(r.declared_at)}${late ? ` · ${Math.floor(hoursSince(r.declared_at))} h` : ''}` : when(r.expires_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div id="tour-agent-summary" className={`${a.card} ${tourHl('tour-agent-summary')}`}>
        <div className={a.cardTitle} style={{ padding: '14px 14px 0' }}>Clôture du jour</div>
        {summary.length === 0 ? <div className={a.empty}>Aucun paiement manuel pour l'instant.</div> : (
          <div className={s.summary} data-testid="daily-summary">
            {summary.map((r) => (
              <div key={`${r.method}:${r.currency}`} className={s.sumCard}>
                <div className={s.sumTitle}>{METHOD_LABEL[r.method] || r.method}</div>
                Validés : <strong>{r.validated_count}</strong> · encaissé <strong>{money(r.validated_total, r.currency)}</strong><br />
                Refusés aujourd'hui : <strong>{r.rejected_count}</strong><br />
                À vérifier : <strong>{r.declared_pending}</strong> · en attente client : <strong>{r.awaiting}</strong>
              </div>
            ))}
          </div>
        )}
      </div>
      </>}

      {selected && <Detail p={selected} onClose={() => setSelected(null)} onDone={async () => { setSelected(null); await load(); }} />}

      {guideOpen && (
        <div className={a.modalOv} style={{ alignItems: 'center', padding: 16 }} onClick={() => setGuideOpen(false)}>
          <div className={s.guideModal} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Guide de vérification">
            <div className={s.panelHead}>
              <h2 style={{ fontSize: 18, fontWeight: 900 }}>Guide de vérification</h2>
              <button className={s.close} onClick={() => setGuideOpen(false)}>Fermer</button>
            </div>
            <AdminGuide audience="agent" onReplayTour={() => { setGuideOpen(false); setTourSteps(AGENT_TOUR_STEPS); setTourStep(0); }} />
          </div>
        </div>
      )}

      <TourOverlay steps={tourSteps} stepIndex={tourStep} onNext={nextTourStep} onSkip={endTour} />
    </div>
  );
}

export default function PaiementsAgentPage() {
  return <Suspense fallback={null}><PaiementsAgent /></Suspense>;
}
