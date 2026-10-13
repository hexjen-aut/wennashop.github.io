'use client';

import { GUIDE } from './guide';
import s from './staff.module.css';

// Procédures de l'équipe. `audience` : 'admin' (tout) ou 'agent' (paiements).
export default function AdminGuide({ audience = 'admin', onReplayTour }) {
  const items = GUIDE.filter((g) => audience === 'admin' || g.who === 'agent');
  return (
    <div className={s.guide}>
      <p className={s.guideIntro}>
        {audience === 'admin'
          ? "Les procédures de l'équipe, étape par étape. Ouvre une fiche pour la suivre."
          : 'Comment vérifier les paiements, étape par étape.'}
      </p>
      {onReplayTour && (
        <button type="button" className={s.guideReplay} onClick={onReplayTour}>Revoir la visite guidée</button>
      )}
      {items.map((g) => (
        <details key={g.id} className={s.guideItem}>
          <summary className={s.guideSummary}>
            {g.title}
            {audience === 'admin' && <span className={s.guideWho}>{g.who === 'agent' ? 'Admins et agents' : 'Admins'}</span>}
          </summary>
          <ol className={s.guideSteps}>
            {g.steps.map((step) => <li key={step}>{step}</li>)}
          </ol>
          {g.note && <p className={s.guideNote}>{g.note}</p>}
        </details>
      ))}
    </div>
  );
}
