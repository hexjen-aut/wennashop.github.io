'use client';

import { useEffect } from 'react';

// Sans service worker enregistré, Chrome/Android n'offre qu'un raccourci
// (ouvert dans un onglet normal, barre d'adresse visible) au lieu d'une
// vraie installation en plein écran — c'est ce composant qui manquait pour
// que "Ajouter à l'écran d'accueil" respecte le display:standalone du
// manifest.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return null;
}
