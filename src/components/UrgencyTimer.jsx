'use client';

// src/components/UrgencyTimer.jsx
//
// Compte à rebours réutilisable pour créer un sentiment d'urgence
// (offre limitée, fin de quête, boost en vedette...).
// Utilisation : <UrgencyTimer endsAt="2026-08-25T18:00:00Z" />
// Disparaît tout seul quand le temps est écoulé.

import { useEffect, useState } from 'react';
import styles from './UrgencyTimer.module.css';

function getRemaining(endsAt) {
  const diff = new Date(endsAt).getTime() - Date.now();
  return diff > 0 ? diff : 0;
}

function fmt(ms) {
  const s = Math.floor(ms / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

export default function UrgencyTimer({ endsAt, label = 'Offre limitée — se termine dans', onExpire }) {
  const [remaining, setRemaining] = useState(() => (endsAt ? getRemaining(endsAt) : 0));

  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => {
      const r = getRemaining(endsAt);
      setRemaining(r);
      if (r <= 0) {
        clearInterval(id);
        onExpire?.();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [endsAt, onExpire]);

  if (!endsAt || remaining <= 0) return null;

  return (
    <div className={styles.urgencyBar}>
      <span className={styles.label}>{label}</span>
      <span className={styles.time}>{fmt(remaining)}</span>
    </div>
  );
}
