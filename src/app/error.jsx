'use client';

import { useEffect } from 'react';
import ErrorScreen from '@/components/ErrorScreen';
import styles from '@/components/ErrorScreen.module.css';

export default function Error({ error, reset }) {
  useEffect(() => { console.error(error); }, [error]);

  return (
    <ErrorScreen
      title="Petit souci de notre côté"
      text="Quelque chose s'est mal passé en chargeant cette page. Réessaie dans un instant ; si ça continue, écris-nous via le bouton d'aide."
    >
      <button type="button" className={styles.btn} onClick={() => reset()}>Réessayer</button>
      <a href="/boutique" className={styles.btnGhost}>Retour à la boutique</a>
    </ErrorScreen>
  );
}
