'use client';

import { useEffect, useState } from 'react';
import styles from './TourOverlay.module.css';

// Tuto interactif générique : flou/assombrit tout l'écran sauf l'élément
// réel désigné par `steps[stepIndex].targetId` (mesuré via
// getBoundingClientRect, jamais deviné), avec une bulle d'explication.
// Pour que l'élément ciblé ressorte net au-dessus du flou, applique-lui la
// classe `tourHighlight` exportée par TourOverlay.module.css quand il est
// actif (voir vendeur/page.jsx pour l'exemple d'origine).
export default function TourOverlay({ steps, stepIndex, onNext, onSkip }) {
  const [rect, setRect] = useState(null);
  const active = stepIndex !== null && stepIndex !== undefined && stepIndex >= 0 && stepIndex < steps.length;
  const step = active ? steps[stepIndex] : null;

  useEffect(() => {
    if (!step) { setRect(null); return; }
    function update() {
      const el = step.targetId ? document.getElementById(step.targetId) : null;
      setRect(el ? el.getBoundingClientRect().toJSON() : null);
    }
    update();
    const t = setTimeout(update, 350); // laisse le changement d'onglet/scroll se stabiliser
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  if (!step) return null;

  const vw = window.innerWidth, vh = window.innerHeight;
  const pad = 8;
  const r = rect ? {
    top: Math.max(0, rect.top - pad),
    left: Math.max(0, rect.left - pad),
    right: Math.min(vw, rect.left + rect.width + pad),
    bottom: Math.min(vh, rect.top + rect.height + pad),
  } : null;

  return (
    <>
      {r ? (
        <>
          <div className={styles.tourVeil} style={{ top: 0, left: 0, width: vw, height: r.top }} />
          <div className={styles.tourVeil} style={{ top: r.bottom, left: 0, width: vw, height: Math.max(0, vh - r.bottom) }} />
          <div className={styles.tourVeil} style={{ top: r.top, left: 0, width: r.left, height: Math.max(0, r.bottom - r.top) }} />
          <div className={styles.tourVeil} style={{ top: r.top, left: r.right, width: Math.max(0, vw - r.right), height: Math.max(0, r.bottom - r.top) }} />
        </>
      ) : (
        <div className={styles.tourVeil} style={{ top: 0, left: 0, width: vw, height: vh }} />
      )}
      <div className={styles.tourPanel}>
        <div className={styles.tourStepLabel}>Étape {stepIndex + 1}/{steps.length}</div>
        <div className={styles.tourTitle}>{step.title}</div>
        <p className={styles.tourText}>{step.text}</p>
        <div className={styles.tourActions}>
          <button className={styles.tourSkip} onClick={onSkip}>Passer</button>
          <button className={styles.tourNext} onClick={onNext}>{stepIndex === steps.length - 1 ? 'Terminé' : 'Suivant'}</button>
        </div>
      </div>
    </>
  );
}
