'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
import styles from './bienvenue.module.css';

const SLIDE_SECONDS = 4;
const MAX_ONBOARDING_VIEWS = 3;

function buildSlides(firstName, role) {
  const isSeller = role === 'artisan';
  return [
    {
      eyebrow: 'Bienvenue',
      title: firstName ? `Ravis de te compter parmi nous, ${firstName}.` : 'Ravis de te compter parmi nous.',
      body: "WennaShop est la marketplace qui connecte l'Afrique, un échange à la fois — vendeurs et acheteurs, d'un pays à l'autre, sans frontière.",
      image: '/bienvenue/hands.webp',
      next: 'Suivant',
    },
    {
      eyebrow: 'Notre mission',
      title: 'Faire circuler le savoir-faire africain, partout sur le continent.',
      body: "Chaque artisan, chaque commerçant mérite un marché plus grand que sa seule ville. WennaShop rapproche vendeurs et acheteurs à travers l'Afrique, pour que la distance ne soit plus un obstacle au commerce.",
      image: '/bienvenue/hands.webp',
      next: 'Suivant',
    },
    isSeller
      ? {
          eyebrow: 'Ce que WennaShop change pour toi',
          title: 'Vends au-delà de tes frontières.',
          body: "Ouvre ta boutique en quelques minutes, touche des acheteurs dans plusieurs pays, et gère commandes, paiements et retraits depuis un seul tableau de bord — sans jamais avoir besoin d'un site à toi.",
          image: '/bienvenue/market.webp',
          next: 'Suivant',
        }
      : {
          eyebrow: 'Ce que WennaShop change pour toi',
          title: 'Achète partout en Afrique, en toute confiance.',
          body: "Des produits authentiques, des vendeurs vérifiés, un suivi de commande de bout en bout. Et si tu ne trouves pas ce que tu cherches, poste une quête — un chasseur le dénichera pour toi.",
          image: '/bienvenue/market.webp',
          next: 'Suivant',
        },
    {
      eyebrow: 'Ce qui nous guide',
      title: 'Quatre principes, non négociables.',
      body: '',
      values: ['Confiance', 'Accessibilité', 'Panafricanisme', 'Transparence'],
      image: '/bienvenue/door.webp',
      next: 'Suivant',
    },
    {
      eyebrow: "C'est parti",
      title: isSeller ? 'Ouvre ta boutique et commence à vendre.' : 'Découvre ce que WennaShop a à t’offrir.',
      body: isSeller
        ? 'Ta boutique t’attend — quelques infos suffisent pour publier ton premier produit.'
        : 'Des milliers de produits, des vendeurs de tout le continent, à un clic de toi.',
      image: '/bienvenue/door.webp',
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
  const viewsCount = useRef(0);

  useEffect(() => {
    (async () => {
      const sb = getSupabase();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { router.replace('/connexion'); return; }

      const { data: row } = await sb.from('users')
        .select('id, first_name, role, onboarding_completed_at, onboarding_views_count')
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

      // Lien de parrainage chasseur (?ref=... sur /connexion) : appliqué
      // automatiquement ici, à la toute première connexion d'un nouveau
      // vendeur — plutôt que de compter sur lui pour retrouver et taper un
      // code à la main dans son tableau de bord. Échec silencieux (code
      // invalide, expiré...) : ce n'est qu'un bonus, jamais un blocage à
      // l'inscription. claim_hunter_referral revalide tout côté serveur.
      if (row && !row.onboarding_completed_at && effectiveRole === 'artisan') {
        let pendingRef = null;
        try { pendingRef = localStorage.getItem('wenna_referral_code'); } catch {}
        if (pendingRef) {
          const { data: myShop } = await sb.from('shops').select('id').eq('user_id', row.id).maybeSingle();
          if (myShop?.id) {
            await sb.rpc('claim_hunter_referral', { p_shop_id: myShop.id, p_code: pendingRef });
          }
        }
      }
      try { localStorage.removeItem('wenna_referral_code'); } catch {}

      const dest = effectiveRole === 'artisan' ? '/vendeur' : '/boutique';
      setDestination(dest);

      if (row?.onboarding_completed_at) { router.replace(dest); return; }

      userRowId.current = row?.id || null;
      viewsCount.current = row?.onboarding_views_count || 0;
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
      const newCount = viewsCount.current + 1;
      const update = { onboarding_views_count: newCount };
      // Affichée aux nouveaux à chaque connexion, jusqu'à 3 fois — au-delà,
      // elle ne réapparaît plus.
      if (newCount >= MAX_ONBOARDING_VIEWS) update.onboarding_completed_at = new Date().toISOString();
      await sb.from('users').update(update).eq('id', userRowId.current);
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
        {slide.image && <img src={slide.image} alt="" className={styles.illustration} />}
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
