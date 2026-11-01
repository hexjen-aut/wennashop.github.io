'use client';

import { useEffect, useState } from 'react';
import { pushSupport, currentSubscription, enablePush, disablePush, syncPushSubscription } from '@/lib/push';

// Carte « Notifications sur cet appareil » : commandes, messages, paiements,
// quêtes arrivent sur le téléphone même quand WennaShop est fermé.
export default function PushToggle({ id, className, style, text }) {
  const [support, setSupport] = useState(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const s = pushSupport();
    setSupport(s);
    if (s === 'granted') {
      currentSubscription().then((sub) => setSubscribed(!!sub)).catch(() => {});
      syncPushSubscription().catch(() => {});
    }
  }, []);

  if (!support || support === 'unsupported') return null;

  async function turnOn() {
    setBusy(true); setError('');
    try {
      const res = await enablePush();
      if (res.ok) setSubscribed(true);
      else if (res.reason === 'denied') setSupport('denied');
      else if (res.reason !== 'default') setError("L'activation n'a pas abouti, réessaie dans un instant.");
    } catch {
      setError("L'activation n'a pas abouti, réessaie dans un instant.");
    }
    setSupport(pushSupport());
    setBusy(false);
  }

  async function turnOff() {
    setBusy(true); setError('');
    try { await disablePush(); setSubscribed(false); } catch {}
    setBusy(false);
  }

  const card = {
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
    padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', ...style,
  };
  const btn = {
    background: 'var(--accent-btn)', color: '#fff', border: 'none', borderRadius: 999,
    padding: '9px 16px', fontSize: 12, fontWeight: 800, cursor: 'pointer', flexShrink: 0,
  };

  let body;
  let action = null;
  if (support === 'ios-install') {
    body = "Sur iPhone, ajoute d'abord WennaShop à ton écran d'accueil : bouton Partager, puis « Sur l'écran d'accueil ». Ouvre ensuite l'app depuis l'icône pour activer les notifications.";
  } else if (support === 'denied') {
    body = "Les notifications sont bloquées pour WennaShop. Autorise-les dans les réglages du navigateur (icône à gauche de l'adresse), puis reviens ici.";
  } else if (subscribed) {
    body = 'Activées sur cet appareil : tu es prévenu même quand WennaShop est fermé.';
    action = <button type="button" onClick={turnOff} disabled={busy} style={{ ...btn, background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Désactiver</button>;
  } else {
    body = text || 'Reçois tes commandes, messages et paiements sur ce téléphone, même quand WennaShop est fermé.';
    action = <button type="button" onClick={turnOn} disabled={busy} style={btn}>{busy ? 'Activation…' : 'Activer'}</button>;
  }

  return (
    <div id={id} className={className} style={card} data-testid="push-toggle">
      <div style={{ flex: '1 1 200px', minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', marginBottom: 2 }}>Notifications sur cet appareil</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{body}</div>
        {error && <div style={{ fontSize: 12, color: 'var(--danger, #e5484d)', marginTop: 4 }}>{error}</div>}
      </div>
      {action}
    </div>
  );
}
