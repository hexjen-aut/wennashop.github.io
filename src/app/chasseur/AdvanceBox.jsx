'use client';

import { useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { ADVANCE_ERRORS, questProofCode } from '@/lib/questRules';
import styles from './chasseur.module.css';

// Avance sur ticket de caisse (submit_purchase_proof) : le prix du produit est
// versé dès que l'équipe valide le ticket, la récompense reste à la livraison.
// Tout est contrôlé en base (5 quêtes livrées, plafond, chemin des photos).

const BUCKET = 'quest-proofs';
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const fmt = (n) => Number(n || 0).toLocaleString('fr-FR');
const cur = (c) => (c === 'XAF' || c === 'XOF' ? 'FCFA' : c || 'FCFA');
const when = (d) => new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function AdvanceBox({ proposal, proof, status, onChanged, showToast }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const currency = proposal.quests?.currency || 'FCFA';
  const code = questProofCode(proposal.id);

  if (proof?.status === 'approved') {
    return (
      <div className={styles.pendingNote} data-testid="advance-approved" style={{ display: 'block' }}>
        Avance validée : {fmt(proof.advance_amount)} {cur(proof.currency)}.
        {!proof.handed_over_at && proof.handover_deadline && <> Remets le colis au transport avant le {when(proof.handover_deadline)}.</>}
      </div>
    );
  }
  if (proof?.status === 'pending') {
    return (
      <div className={styles.pendingNote} data-testid="advance-pending" style={{ display: 'block' }}>
        Ticket envoyé : avance de {fmt(proof.advance_amount)} {cur(proof.currency)} en cours de vérification.
      </div>
    );
  }
  if (proposal.status !== 'selected' || !status) return null;

  if (!status.eligible) {
    return (
      <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 8 }} data-testid="advance-locked">
        Avance du prix du produit sur ticket de caisse : possible après {status.min_quests} quêtes livrées (tu en as {status.delivered}).
      </div>
    );
  }

  function pick(setter) {
    return (e) => {
      const f = e.target.files?.[0];
      if (f && (!ALLOWED.includes(f.type) || f.size > 5 * 1024 * 1024)) { showToast('Image ou PDF de 5 Mo maximum.', 'error'); e.target.value = ''; return; }
      setter(f || null);
    };
  }

  async function submit() {
    const v = parseFloat(String(amount).replace(',', '.'));
    if (!(v > 0)) return showToast('Indique le montant du ticket.', 'error');
    if (!receipt || !photo) return showToast('Ajoute le ticket et la photo du produit.', 'error');
    setBusy(true);
    const sb = getSupabase();
    const { data: { user } } = await sb.auth.getUser();
    const paths = [];
    for (const [file, name] of [[receipt, 'ticket'], [photo, 'produit']]) {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${user.id}/${proposal.id}/${Date.now()}-${name}.${ext}`;
      const { error } = await sb.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type });
      if (error) { setBusy(false); return showToast('Envoi impossible : ' + error.message, 'error'); }
      paths.push(path);
    }
    const { error } = await sb.rpc('submit_purchase_proof', {
      p_proposal_id: proposal.id, p_receipt_amount: v, p_receipt_path: paths[0], p_photo_path: paths[1],
    });
    setBusy(false);
    if (error) return showToast(ADVANCE_ERRORS[error.message] || 'Erreur : ' + error.message, 'error');
    showToast("Ticket envoyé. L'équipe le vérifie.", 'ok');
    setOpen(false);
    onChanged?.();
  }

  return (
    <div style={{ marginTop: 10 }} data-testid="advance-box">
      {proof?.status === 'rejected' && (
        <div style={{ fontSize: 11, color: 'var(--error)', marginBottom: 6 }}>Ticket précédent refusé : {proof.reject_reason}</div>
      )}
      {!open ? (
        <button type="button" className={styles.btnHunt} onClick={() => setOpen(true)}>
          Demander l'avance du produit
        </button>
      ) : (
        <div style={{ display: 'grid', gap: 8, background: 'var(--surface-2)', borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text-muted)' }}>
            Achète le produit, puis envoie le ticket de caisse et une photo du produit à côté d'un papier où tu as écrit
            {' '}<strong style={{ color: 'var(--text)', fontFamily: 'monospace' }}>{code}</strong>. Une fois validé, le prix du produit t'est versé
            (au plus le prix de ton offre, {fmt(proposal.proposed_price)} {currency}). Ta récompense reste versée à la livraison.
            {' '}Tu as ensuite {status.handover_hours} h pour remettre le colis au transport.
            {' '}Avances encore possibles : {fmt(status.remaining_xaf)} FCFA.
          </div>
          <input className={styles.input} type="number" min="0" step="any" inputMode="decimal" aria-label="Montant du ticket"
            placeholder={`Montant du ticket (${currency})`} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)' }}>
            Ticket de caisse
            <input type="file" accept="image/*,.pdf" onChange={pick(setReceipt)} style={{ display: 'block', marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)' }}>
            Photo du produit avec le code {code}
            <input type="file" accept="image/*" onChange={pick(setPhoto)} style={{ display: 'block', marginTop: 4 }} />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className={styles.expressBtn} disabled={busy} onClick={submit}>{busy ? 'Envoi…' : 'Envoyer le ticket'}</button>
            <button type="button" className={styles.btnReset} style={{ width: 'auto', marginTop: 0, padding: '8px 14px' }} disabled={busy} onClick={() => setOpen(false)}>Annuler</button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>Sans ticket, rien ne change : produit, transport et récompense te sont versés à la livraison.</div>
        </div>
      )}
    </div>
  );
}
