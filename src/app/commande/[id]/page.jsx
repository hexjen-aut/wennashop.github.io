'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';
import Nav from '@/components/Nav';
import styles from './commande.module.css';

// Paiement manuel d'une commande : instructions (numéro / RIB, montant exact,
// référence), déclaration « J'ai payé », suivi du statut en direct.
// Le montant et la référence viennent du serveur (create_manual_payment) ;
// la validation est faite par un agent (review_payment).

const METHOD_LABEL = { airtel_money: 'Airtel Money', moov_money: 'Moov Money', virement: 'Virement bancaire' };
const DECLARE_ERRORS = {
  invalid_transaction_id: "L'ID de transaction semble incorrect : vérifie-le dans ton SMS ou ton relevé.",
  transaction_already_used: 'Cet ID de transaction a déjà été utilisé pour un autre paiement.',
  payment_expired: 'Le délai de paiement est dépassé.',
  not_awaiting_payment: 'Ce paiement a déjà été déclaré.',
  invalid_proof_path: "La capture n'a pas pu être jointe. Réessaie.",
};
const PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

function money(n, c) {
  const v = Number(n || 0).toLocaleString('fr-FR');
  return `${v} ${c === 'XAF' || c === 'XOF' ? 'FCFA' : c}`;
}

function remaining(expiresAt, now) {
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}

function CopyButton({ value, label = 'Copier' }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className={styles.copy} onClick={() => {
      try { navigator.clipboard.writeText(String(value)); setDone(true); setTimeout(() => setDone(false), 1500); } catch {}
    }}>
      <i className={`ph ${done ? 'ph-check' : 'ph-copy'}`} aria-hidden="true" />{done ? 'Copié' : label}
    </button>
  );
}

export default function CommandePage() {
  const { id: orderId } = useParams();
  const [state, setState] = useState({ loading: true, error: null });
  const [order, setOrder] = useState(null);
  const [payment, setPayment] = useState(null);
  const [account, setAccount] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [form, setForm] = useState({ txn: '', sender: '' });
  const [proof, setProof] = useState(null);
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState(null);

  const load = useCallback(async () => {
    const sb = getSupabase();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { setState({ loading: false, error: 'Connecte-toi pour voir ta commande.' }); return; }
    const [{ data: o }, { data: p }] = await Promise.all([
      sb.from('orders').select('id,status,tracking_number,shipping_country,quest_id').eq('id', orderId).maybeSingle(),
      sb.from('payments').select('id,reference,payment_method_code,amount,currency,country,verification_status,status,transaction_id,reject_reason,on_hold,expires_at,declared_at')
        .eq('order_id', orderId).eq('type', 'order_payment').maybeSingle(),
    ]);
    if (!o) { setState({ loading: false, error: 'Commande introuvable.' }); return; }
    setOrder(o);
    setPayment(p || null);
    if (p?.verification_status && p.payment_method_code) {
      const { data: acc } = await sb.from('country_payment_methods')
        .select('account_number,account_holder,instructions,country_code')
        .eq('payment_method_code', p.payment_method_code).eq('is_enabled', true)
        .order('country_code');
      setAccount((acc || []).find((a) => a.country_code === p.country) || (acc || [])[0] || null);
    }
    setState({ loading: false, error: null });
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  // Statut en direct (Realtime, RLS : seulement ses propres paiements) + relecture de secours
  useEffect(() => {
    if (!payment?.id) return;
    const sb = getSupabase();
    const channel = sb.channel(`manual-payment-${payment.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'payments', filter: `id=eq.${payment.id}` }, () => load())
      .subscribe();
    const poll = setInterval(load, 30000);
    return () => { sb.removeChannel(channel); clearInterval(poll); };
  }, [payment?.id, load]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  async function declare(e) {
    e.preventDefault();
    setFormError(null);
    if (form.txn.replace(/\s/g, '').length < 4) { setFormError("Indique l'ID de transaction reçu par SMS ou sur ton relevé."); return; }
    if (proof && (!PROOF_TYPES.includes(proof.type) || proof.size > 5 * 1024 * 1024)) {
      setFormError('Capture : image ou PDF de 5 Mo maximum.');
      return;
    }
    setSending(true);
    const sb = getSupabase();
    let proofPath = null;
    if (proof) {
      const { data: { user } } = await sb.auth.getUser();
      const ext = (proof.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      proofPath = `${user.id}/${payment.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await sb.storage.from('payment-proofs').upload(proofPath, proof, { contentType: proof.type });
      if (upErr) { setSending(false); setFormError("La capture n'a pas pu être envoyée. Réessaie ou déclare sans capture."); return; }
    }
    const { error } = await sb.rpc('declare_payment', {
      p_payment_id: payment.id, p_transaction_id: form.txn, p_sender_number: form.sender, p_proof_path: proofPath,
    });
    setSending(false);
    if (error) { setFormError(DECLARE_ERRORS[error.message] || "La déclaration n'a pas pu être envoyée. Réessaie."); return; }
    setForm({ txn: '', sender: '' });
    setProof(null);
    await load();
  }

  if (state.loading) return <><Nav /><div style={{ padding: 60, textAlign: 'center', color: 'var(--text-faint)' }}>Chargement…</div></>;
  if (state.error) return <><Nav /><div className={styles.wrap}><p>{state.error}</p></div></>;

  const followUrl = order?.quest_id ? `/quete?id=${order.quest_id}` : `/suivi?order=${orderId}`;
  const vs = payment?.verification_status;
  const label = METHOD_LABEL[payment?.payment_method_code] || payment?.payment_method_code;
  const isTransfer = payment?.payment_method_code === 'virement';
  const left = payment?.expires_at ? remaining(payment.expires_at, now) : null;

  // Commande sans paiement manuel (livraison, SingPay, Airtel direct…)
  if (!vs) {
    return (
      <>
        <Nav />
        <div className={styles.wrap}>
          <h1 className={styles.title}>Ta commande</h1>
          <p className={styles.lead}>Le suivi de cette commande se fait sur la page de suivi.</p>
          <Link href={followUrl} className={styles.btnGhost}>Suivre ma commande</Link>
        </div>
      </>
    );
  }

  return (
    <>
      <Nav />
      <div className={styles.wrap}>
        <h1 className={styles.title}>Paiement de ta commande</h1>
        <p className={styles.lead}>Référence <strong className={styles.ref}>{payment.reference}</strong> · {label}</p>

        {vs === 'validated' && (
          <div className={`${styles.card} ${styles.status}`} data-testid="status-validated">
            <div className={styles.statusTitle}>Paiement validé</div>
            <p className={styles.statusText}>Merci ! Ton paiement est confirmé et le vendeur prépare ta commande.</p>
            <Link href={followUrl} className={styles.btnGhost}>Suivre ma commande</Link>
          </div>
        )}

        {vs === 'expired' && (
          <div className={`${styles.card} ${styles.status}`} data-testid="status-expired">
            <div className={styles.statusTitle}>Délai de paiement dépassé</div>
            <p className={styles.statusText}>La commande a été annulée. Si tu as quand même payé, contacte le support avec la référence {payment.reference}.</p>
            <Link href="/boutique" className={styles.btnGhost}>Retour à la boutique</Link>
          </div>
        )}

        {vs === 'declared' && (
          <div className={`${styles.card} ${styles.status}`} data-testid="status-declared">
            <div className={styles.statusTitle}><span className={styles.dot} />Vérification en cours</div>
            <p className={styles.statusText}>
              {payment.on_hold
                ? 'La vérification demande un peu plus de temps (contrôle auprès de l\'opérateur ou de la banque). Tu seras prévenu dès qu\'elle est terminée.'
                : `Notre équipe vérifie ton paiement (ID ${payment.transaction_id}). Cette page se met à jour toute seule.`}
            </p>
          </div>
        )}

        {vs === 'awaiting_payment' && (
          <>
            {payment.reject_reason && (
              <div className={styles.alert} data-testid="reject-reason">
                <strong>Paiement non validé :</strong> {payment.reject_reason}. Vérifie les informations et déclare à nouveau ton paiement.
              </div>
            )}
            <div className={`${styles.card} ${styles.cardAccent}`}>
              <div className={styles.cardTitle}>1. Paie {isTransfer ? 'par virement' : `par ${label}`}</div>
              <div className={styles.row}><span>Montant exact</span><span className={styles.value}>{money(payment.amount, payment.currency)}</span><CopyButton value={payment.amount} /></div>
              <div className={styles.row}><span>{isTransfer ? 'RIB' : 'Numéro'}</span><span className={styles.value}>{account?.account_number || '—'}</span>{account?.account_number && <CopyButton value={account.account_number} />}</div>
              {account?.account_holder && <div className={styles.row}><span>Titulaire</span><span className={styles.value}>{account.account_holder}</span></div>}
              <div className={styles.row}><span>{isTransfer ? 'Motif du virement' : 'Référence'}</span><span className={`${styles.value} ${styles.ref}`}>{payment.reference}</span><CopyButton value={payment.reference} /></div>
              {account?.instructions && <p className={styles.instructions}>{account.instructions}</p>}
              <p className={styles.instructions}>Les frais d'envoi sont à ta charge : le montant reçu doit être au moins égal au montant exact.</p>
              <p className={`${styles.timer} ${left ? '' : styles.timerLate}`} data-testid="countdown">
                {left ? <>Temps restant pour payer : <strong>{left}</strong></> : 'Délai dépassé : la commande va être annulée.'}
              </p>
            </div>

            <form className={styles.card} onSubmit={declare}>
              <div className={styles.cardTitle}>2. Déclare ton paiement</div>
              <label className={styles.label} htmlFor="txn">ID de transaction *</label>
              <input id="txn" className={styles.input} value={form.txn} onChange={(e) => setForm({ ...form, txn: e.target.value })}
                placeholder={isTransfer ? 'Référence du virement sur ton relevé' : 'Ex : MP241013.1530.A12345'} autoComplete="off" />
              <p className={styles.hint}>{isTransfer ? 'Indiquée sur ton relevé ou ton reçu de virement.' : 'Reçu par SMS juste après ton envoi.'}</p>
              <label className={styles.label} htmlFor="sender">{isTransfer ? 'Nom ou compte émetteur' : 'Numéro qui a envoyé'}</label>
              <input id="sender" className={styles.input} inputMode={isTransfer ? 'text' : 'tel'} value={form.sender} onChange={(e) => setForm({ ...form, sender: e.target.value })} />
              <label className={styles.label} htmlFor="proof">Capture du paiement (facultatif)</label>
              <input id="proof" className={styles.input} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setProof(e.target.files?.[0] || null)} />
              {formError && <p className={styles.error}>{formError}</p>}
              <button className={styles.btn} type="submit" disabled={sending || !left}>{sending ? 'Envoi…' : "J'ai payé"}</button>
            </form>
          </>
        )}
      </div>
    </>
  );
}
