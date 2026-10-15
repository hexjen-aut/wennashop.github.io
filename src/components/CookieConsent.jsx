'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Analytics } from '@vercel/analytics/next';
import {
  readConsent, saveConsent, hasAnalyticsConsent,
  CONSENT_EVENT, CONSENT_OPEN_EVENT,
} from '@/lib/consent';
import styles from './CookieConsent.module.css';

// Bandeau de consentement + chargement de la mesure d'audience seulement
// après accord. Le bandeau ne bloque pas la page : on peut naviguer sans
// répondre, rien d'optionnel n'est chargé tant qu'il n'y a pas de « oui ».
export default function CookieConsent() {
  const [open, setOpen] = useState(false);
  const [analytics, setAnalytics] = useState(false);

  useEffect(() => {
    const c = readConsent();
    setAnalytics(c?.analytics === true);
    if (!c) setOpen(true);

    const onChange = (e) => setAnalytics(e.detail?.analytics === true);
    const onOpen = () => setOpen(true);
    window.addEventListener(CONSENT_EVENT, onChange);
    window.addEventListener(CONSENT_OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener(CONSENT_EVENT, onChange);
      window.removeEventListener(CONSENT_OPEN_EVENT, onOpen);
    };
  }, []);

  function choose(accept) {
    saveConsent({ analytics: accept });
    setOpen(false);
  }

  return (
    <>
      {analytics && (
        // Un retrait du consentement coupe l'envoi tout de suite, sans
        // attendre le prochain chargement de page.
        <Analytics beforeSend={(event) => (hasAnalyticsConsent() ? event : null)} />
      )}
      {open && (
        <div className={styles.banner} role="dialog" aria-live="polite" aria-labelledby="cookie-title">
          <p id="cookie-title" className={styles.title}>Cookies et confidentialité</p>
          <p className={styles.text}>
            WennaShop garde dans ton navigateur ce qui fait marcher le site : connexion, panier, pays d'affichage.
            Avec ton accord, on mesure aussi la fréquentation de façon anonyme, pour améliorer le site.
            Aucun cookie publicitaire. Tu peux changer d'avis à tout moment avec le lien « Gérer les cookies ».{' '}
            <Link href="/confidentialite" className={styles.link}>En savoir plus</Link>
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.btn} onClick={() => choose(false)}>Refuser</button>
            <button type="button" className={styles.btn} onClick={() => choose(true)}>Accepter</button>
          </div>
        </div>
      )}
    </>
  );
}
