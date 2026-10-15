'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Analytics } from '@vercel/analytics/next';
import {
  readConsent, saveConsent, hasAnalyticsConsent, GA_ID,
  CONSENT_EVENT, CONSENT_OPEN_EVENT,
} from '@/lib/consent';
import styles from './CookieConsent.module.css';

// Google Analytics 4, injecté seulement après accord. Les pages suivantes
// (navigation interne) sont comptées par la mesure améliorée de GA4.
// Cookies _ga limités à 13 mois ; signaux publicitaires Google coupés
// (pas de doubleclick, pas de personnalisation des annonces).
function loadGoogleAnalytics() {
  window[`ga-disable-${GA_ID}`] = false;
  if (window.gtag) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', GA_ID, {
    cookie_expires: 13 * 30 * 24 * 60 * 60,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);
}

// Retrait du consentement : coupe l'envoi tout de suite et efface les
// cookies _ga déjà posés.
function stopGoogleAnalytics() {
  window[`ga-disable-${GA_ID}`] = true;
  const host = window.location.hostname;
  const domains = ['', host, `.${host}`, `.${host.split('.').slice(-2).join('.')}`];
  document.cookie.split(';').map((c) => c.split('=')[0].trim())
    .filter((name) => name === '_ga' || name.startsWith('_ga_'))
    .forEach((name) => {
      domains.forEach((d) => {
        document.cookie = `${name}=; Max-Age=0; path=/${d ? `; domain=${d}` : ''}`;
      });
    });
}

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

  useEffect(() => {
    if (analytics) loadGoogleAnalytics();
    else if (window.gtag) stopGoogleAnalytics();
  }, [analytics]);

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
            Avec ton accord, on mesure aussi la fréquentation (Vercel Analytics et Google Analytics) pour améliorer le site.
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
