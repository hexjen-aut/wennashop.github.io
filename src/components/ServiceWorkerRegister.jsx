'use client';

import { useEffect, useState } from 'react';

const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID;
const CHECK_EVERY_MS = 30 * 60 * 1000;

// Sans service worker enregistré, Chrome/Android n'offre qu'un raccourci
// (ouvert dans un onglet normal, barre d'adresse visible) au lieu d'une
// vraie installation en plein écran.
//
// L'app installée reste souvent ouverte en arrière-plan pendant des jours :
// on vérifie la version en ligne au retour au premier plan et on propose de
// recharger, plutôt que de recharger d'office (un vendeur peut être en train
// de remplir une fiche produit).
export default function ServiceWorkerRegister() {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(BUILD_ID || '1')}`).catch(() => {});
    }
    if (!BUILD_ID) return undefined;

    let stopped = false;
    async function check() {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok) return;
        const { version } = await res.json();
        if (!stopped && version && version !== BUILD_ID) setUpdateReady(true);
      } catch {}
    }
    function onVisible() { if (document.visibilityState === 'visible') check(); }

    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(check, CHECK_EVERY_MS);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, []);

  if (!updateReady) return null;
  return (
    <div
      role="status"
      style={{
        position: 'fixed', left: '50%', transform: 'translateX(-50%)',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)', zIndex: 8000,
        display: 'flex', alignItems: 'center', gap: 12, maxWidth: 'calc(100vw - 32px)',
        background: 'var(--surface)', border: '1.5px solid var(--border-accent)', borderRadius: 999,
        padding: '8px 8px 8px 16px', boxShadow: '0 8px 24px rgba(0,0,0,.35)', fontSize: 13, color: 'var(--text)',
      }}
    >
      <span>Nouvelle version disponible</span>
      <button
        onClick={() => window.location.reload()}
        style={{ background: 'var(--accent-btn)', color: '#fff', border: 'none', borderRadius: 999, padding: '8px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
      >
        Mettre à jour
      </button>
    </div>
  );
}
