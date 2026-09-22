'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
import styles from './bienvenue.module.css';

const SLIDE_SECONDS = 4;

function buildSlides(firstName, role) {
  const isSeller = role === 'artisan';
  return [
    {
      eyebrow: 'Bienvenue',
      title: firstName ? `Ravis de te compter parmi nous, ${firstName}.` : 'Ravis de te compter parmi nous.',
      body: "WennaShop est la marketplace qui connecte l'Afrique, un échange à la fois — vendeurs et acheteurs, d'un pays à l'autre, sans frontière.",
      next: 'Suivant',
    },
    {
      eyebrow: 'Notre mission',
      title: 'Faire circuler le savoir-faire africain, partout sur le continent.',
      body: "Chaque artisan, chaque commerçant mérite un marché plus grand que sa seule ville. WennaShop rapproche vendeurs et acheteurs à travers l'Afrique, pour que la distance ne soit plus un obstacle au commerce.",
      next: 'Suivant',
    },
    isSeller
      ? {
          eyebrow: 'Ce que WennaShop change pour toi',
          title: 'Vends au-delà de tes frontières.',
          body: "Ouvre ta boutique en quelques minutes, touche des acheteurs dans plusieurs pays, et gère commandes, paiements et retraits depuis un seul tableau de bord — sans jamais avoir besoin d'un site à toi.",
          next: 'Suivant',
        }
      : {
          eyebrow: 'Ce que WennaShop change pour toi',
          title: 'Achète partout en Afrique, en toute confiance.',
          body: "Des produits authentiques, des vendeurs vérifiés, un suivi de commande de bout en bout. Et si tu ne trouves pas ce que tu cherches, poste une quête — un chasseur le dénichera pour toi.",
          next: 'Suivant',
        },
    {
      eyebrow: 'Ce qui nous guide',
      title: 'Quatre principes, non négociables.',
      body: '',
      values: ['Confiance', 'Accessibilité', 'Panafricanisme', 'Transparence'],
      next: 'Suivant',
    },
    {
      eyebrow: "C'est parti",
      title: isSeller ? 'Ouvre ta boutique et commence à vendre.' : 'Découvre ce que WennaShop a à t’offrir.',
      body: isSeller
        ? 'Ta boutique t’attend — quelques infos suffisent pour publier ton premier produit.'
        : 'Des milliers de produits, des vendeurs de tout le continent, à un clic de toi.',
      next: isSeller ? 'Ouvrir ma boutique' : 'Commencer mes achats',
      final: true,
    },
  ];
}

export default function BienvenuePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [role, setRole] = useState('buyer');
  const [destination, setDestination] = useState('/boutique');
  const [slideIndex, setSlideIndex] = useState(0);
  const [countdown, setCountdown] = useState(SLIDE_SECONDS);
  const [btnReady, setBtnReady] = useState(false);
  const userRowId = useRef(null);

  useEffect(() => {
    (async () => {
      const sb = getSupabase();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { router.replace('/connexion'); return; }

      const { data: row } = await sb.from('users')
        .select('id, first_name, role, onboarding_completed_at')
        .eq('auth_id', session.user.id)
        .maybeSingle();

      let effectiveRole = row?.role || 'buyer';

      // Cas Google : le rôle choisi avant la redirection OAuth n'a pas pu
      // être transmis à Supabase, on le rattrape ici — mais seulement à la
      // toute première connexion, pour ne jamais changer le rôle d'un
      // compte existant qui se reconnecte.
      if (row && !row.onboarding_completed_at) {
        let pendingRole = null;
        try { pendingRole = localStorage.getItem('wenna_signup_role'); } catch {}
        if (pendingRole && pendingRole !== row.role) {
          await sb.from('users').update({ role: pendingRole }).eq('id', row.id);
          effectiveRole = pendingRole;
        }
      }
      try { localStorage.removeItem('wenna_signup_role'); } catch {}

      const dest = effectiveRole === 'artisan' ? '/vendeur' : '/boutique';
      setDestination(dest);

      if (row?.onboarding_completed_at) { router.replace(dest); return; }

      userRowId.current = row?.id || null;
      setFirstName(row?.first_name || '');
      setRole(effectiveRole);
      setReady(true);
    })();
  }, [router]);

  const slides = ready ? buildSlides(firstName, role) : [];
  const slide = slides[slideIndex];

  useEffect(() => {
    if (!ready) return;
    setCountdown(SLIDE_SECONDS);
    setBtnReady(false);
    const tick = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(tick); setBtnReady(true); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [slideIndex, ready]);

  async function finishOnboarding() {
    const sb = getSupabase();
    if (userRowId.current) {
      await sb.from('users').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', userRowId.current);
    }
    router.replace(destination);
  }

  function handleNext() {
    if (!btnReady) return;
    if (slide.final) { finishOnboarding(); return; }
    setSlideIndex((i) => i + 1);
  }

  if (!ready) return <div className={styles.wrap} />;

  return (
    <div className={styles.wrap}>
      <button className={styles.skip} onClick={finishOnboarding}>Passer</button>

      <div className={styles.dots}>
        {slides.map((_, i) => (
          <span key={i} className={`${styles.dot} ${i === slideIndex ? styles.dotActive : i < slideIndex ? styles.dotDone : ''}`} />
        ))}
      </div>

      <div className={styles.card} key={slideIndex}>
        <img src="/wenna_icon.png" alt="WennaShop" className={styles.logo} />
        <div className={styles.eyebrow}>{slide.eyebrow}</div>
        <div className={styles.title}>{slide.title}</div>
        {slide.body && <div className={styles.body}>{slide.body}</div>}
        {slide.values && (
          <div className={styles.values}>
            {slide.values.map((v) => <span key={v} className={styles.valuePill}>{v}</span>)}
          </div>
        )}

        <div className={styles.actions}>
          <button className={styles.btnNext} disabled={!btnReady} onClick={handleNext}>
            {btnReady ? slide.next : `${slide.next}…`}
          </button>
          <div className={styles.track}>
            <div className={styles.trackFill} style={{ width: `${((SLIDE_SECONDS - countdown) / SLIDE_SECONDS) * 100}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
