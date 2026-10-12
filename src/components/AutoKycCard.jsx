'use client';

import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';

// Vérification d'identité automatique (Didit) pour un dossier vendeur ou
// chasseur en attente. N'apparaît que si l'admin l'a activée ; sinon le
// dossier suit la validation manuelle habituelle.
export default function AutoKycCard({ purpose }) {
  const [state, setState] = useState(null); // { enabled, status, reason }
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const sb = getSupabase();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;
      const [{ data: cfg }, { data: me }] = await Promise.all([
        sb.from('site_config').select('value').eq('key', 'kyc_auto_enabled').maybeSingle(),
        sb.from('users').select('kyc_auto_status, kyc_auto_reason, kyc_purpose').eq('auth_id', session.user.id).maybeSingle(),
      ]);
      const mine = me?.kyc_purpose === purpose;
      setState({
        enabled: cfg?.value === 'true',
        status: mine ? me?.kyc_auto_status : null,
        reason: mine ? me?.kyc_auto_reason : null,
      });
    })();
  }, [purpose]);

  async function start() {
    setStarting(true);
    setError('');
    const { data, error: fnError } = await getSupabase().functions.invoke('kyc-start', { body: { purpose } });
    if (fnError || !data?.url) {
      let message = data?.error;
      try { message = message || (await fnError?.context?.json())?.error; } catch {}
      setError(message || 'Impossible de lancer la vérification.');
      setStarting(false);
      return;
    }
    window.location.href = data.url;
  }

  if (!state?.enabled || state.status === 'approved') return null;

  const box = { border: '1.5px solid var(--border-accent)', borderRadius: 12, padding: '14px 16px', margin: '0 0 16px', fontSize: 13, lineHeight: 1.5 };

  if (state.status === 'pending') {
    return (
      <div style={box} data-testid="auto-kyc">
        <strong>Vérification d'identité en cours de traitement.</strong> Le résultat arrive en quelques minutes ; si tu n'as pas terminé sur la page de vérification, tu peux la relancer.
        <div style={{ marginTop: 10 }}>
          <button type="button" onClick={start} disabled={starting} style={btn}>{starting ? 'Ouverture…' : 'Reprendre la vérification'}</button>
        </div>
        {error && <p style={{ color: 'var(--error)', marginTop: 8 }}>{error}</p>}
      </div>
    );
  }

  return (
    <div style={box} data-testid="auto-kyc">
      <strong>Fais valider ton dossier en 2 minutes.</strong>{' '}
      Photo de ta pièce d'identité puis un selfie : si tout est conforme, ton compte est validé automatiquement, sans attendre l'équipe.
      {(state.status === 'declined' || state.status === 'review') && (
        <p style={{ color: 'var(--text-muted)', marginTop: 6 }}>
          Dernière tentative non concluante{state.reason ? ` : ${state.reason}` : ''}. Ton dossier reste vérifié par l'équipe, ou tu peux réessayer.
        </p>
      )}
      <div style={{ marginTop: 10 }}>
        <button type="button" onClick={start} disabled={starting} style={btn}>{starting ? 'Ouverture…' : 'Vérifier mon identité maintenant'}</button>
      </div>
      {error && <p style={{ color: 'var(--error)', marginTop: 8 }}>{error}</p>}
    </div>
  );
}

const btn = { background: 'var(--accent-btn)', color: '#fff', border: 'none', borderRadius: 999, padding: '10px 20px', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)' };
