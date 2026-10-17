import Link from 'next/link';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import { getServerSupabase } from '@/lib/supabaseServer';
import styles from './vendre.module.css';

export const metadata = {
  title: 'Vendre au Gabon depuis le Maroc — WennaShop',
  description: "Ouvre ta boutique gratuitement et vends tes produits marocains aux acheteurs du Gabon. Prix affichés en FCFA, argent encaissé par WennaShop et reversé après la livraison.",
  alternates: { canonical: 'https://wennashop.com/vendre' },
};

// Le compteur des places de vendeur fondateur est relu toutes les 5 min.
export const revalidate = 300;

const FOUNDER_TOTAL = 20;
// Après connexion, /compte ouvre directement le formulaire vendeur.
const SIGNUP_HREF = '/compte?vendre=1';
// Photo : Martina Picciau, Unsplash (licence Unsplash, usage libre).
const HERO_IMAGE = 'https://images.unsplash.com/photo-1753740023014-143ab3536662?fm=jpg&q=75&w=1200&fit=crop&auto=format';

async function loadPlacesLeft() {
  try {
    const { data, error } = await getServerSupabase().rpc('founder_places_left');
    return error || data == null ? null : Number(data);
  } catch {
    return null;
  }
}

const REASONS = [
  {
    title: 'Boutique gratuite',
    text: "Pas d'abonnement ni de frais d'inscription. WennaShop prend une commission seulement quand tu vends, de 6 à 13 % selon la catégorie.",
  },
  {
    title: "Tu n'as pas à courir après l'argent",
    text: "L'acheteur paie WennaShop (Airtel Money ou à la livraison au Gabon). Après la livraison, on te reverse ta part par virement, commission déduite, avec une référence.",
  },
  {
    title: 'Tes prix en FCFA',
    text: "Tu fixes ton prix en dirhams. L'acheteur gabonais le voit directement en FCFA, au taux du jour.",
  },
  {
    title: 'Des acheteurs qui te font confiance',
    text: "Chaque vendeur est vérifié (pièce d'identité) avant d'apparaître sur le site. Les acheteurs le savent, et ils achètent plus facilement.",
  },
];

const STEPS = [
  {
    title: 'Crée ta boutique',
    text: "Nom, spécialité et pièce d'identité. Notre équipe valide ton dossier sous 24 à 48 h.",
  },
  {
    title: 'Ajoute tes produits',
    text: 'Photos, prix, délai de livraison. Coche « Gabon » dans les pays où tu expédies : tes produits apparaissent chez les acheteurs gabonais.',
  },
  {
    title: 'Expédie tes commandes',
    text: "Tu es prévenu à chaque commande. Tu prépares le colis, tu l'envoies avec ton transporteur et tu ajoutes le numéro de suivi.",
  },
  {
    title: 'Reçois ton argent',
    text: 'Une fois la commande livrée, WennaShop te reverse le montant de la vente, commission déduite, par virement.',
  },
];

const QUESTIONS = [
  {
    q: 'Combien ça coûte ?',
    a: "L'ouverture de la boutique et la mise en ligne des produits sont gratuites. Tu paies uniquement une commission sur chaque vente livrée, selon la catégorie du produit (grille complète sur la page Commissions).",
  },
  {
    q: 'Comment se passe la livraison vers le Gabon ?',
    a: "Tu expédies toi-même, avec le transporteur de ton choix. Indique sur chaque produit le délai de livraison et compte le transport dans ton prix : l'acheteur ne paie rien de plus au moment de commander.",
  },
  {
    q: 'Quand suis-je payé ?',
    a: "Après la livraison de la commande. WennaShop te reverse ta part par virement sur ton compte au Maroc, et t'envoie la référence du virement.",
  },
  {
    q: 'Je peux aussi vendre au Maroc ?',
    a: 'Oui. Tes produits sont visibles des acheteurs marocains par défaut ; le Gabon et les autres pays s’ajoutent en cochant les pays où tu expédies.',
  },
  {
    q: "Qu'est-ce qui est interdit ?",
    a: "Les contrefaçons, les produits dangereux ou illicites, et tout ce qui est interdit par la loi du Maroc ou du Gabon. Le détail est dans les conditions générales.",
  },
];

export default async function VendrePage() {
  const placesLeft = await loadPlacesLeft();
  const founderOpen = placesLeft == null || placesLeft > 0;

  return (
    <>
      <Nav />
      <main className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.heroText}>
            <div className={styles.eyebrow}>Vendeurs du Maroc</div>
            <h1 className={styles.title}>Vends tes produits au Gabon, depuis le Maroc</h1>
            <p className={styles.lead}>
              Caftans, babouches, argan, cosmétiques, décoration : les produits marocains sont recherchés au Gabon.
              WennaShop te met en vitrine devant ces acheteurs, encaisse pour toi et te reverse ton argent après la livraison.
            </p>
            <div className={styles.actions}>
              <Link href={SIGNUP_HREF} className={styles.btn}>Ouvrir ma boutique gratuitement</Link>
              <Link href="/commissions" className={styles.link}>Voir les commissions</Link>
            </div>
            {placesLeft != null && placesLeft > 0 && (
              <p className={styles.places}>
                Plus que <strong>{placesLeft}</strong> place{placesLeft > 1 ? 's' : ''} de vendeur fondateur sur {FOUNDER_TOTAL}.
              </p>
            )}
          </div>
          <div className={styles.heroMedia}>
            <img src={HERO_IMAGE} alt="Allée d'un souk au Maroc, boutiques de céramique, vêtements et objets en laiton" />
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Pourquoi vendre sur WennaShop</h2>
          <div className={styles.reasons}>
            {REASONS.map((r) => (
              <div className={styles.reason} key={r.title}>
                <h3 className={styles.h3}>{r.title}</h3>
                <p>{r.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Comment ça marche</h2>
          <ol className={styles.steps}>
            {STEPS.map((s, i) => (
              <li className={styles.step} key={s.title}>
                <span className={styles.stepNum}>{i + 1}</span>
                <div>
                  <h3 className={styles.h3}>{s.title}</h3>
                  <p>{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className={`${styles.section} ${styles.founder}`}>
          <div className={styles.eyebrow}>Offre de lancement</div>
          <h2 className={styles.h2}>Deviens vendeur fondateur</h2>
          <p>
            Les {FOUNDER_TOTAL} premières boutiques validées qui mettent un produit en ligne deviennent vendeurs fondateurs :
          </p>
          <ul className={styles.perks}>
            <li>le badge « Vendeur fondateur » sur ta boutique et tes produits, pour toujours ;</li>
            <li>3 mois de mise en avant sur la page d&apos;accueil de la boutique, dans le bandeau « Vendeurs fondateurs », à partir de ton premier produit en ligne.</li>
          </ul>
          <p className={styles.small}>Rien à payer en plus : la commission reste la même que pour tous les vendeurs.</p>
          {founderOpen ? (
            <>
              {placesLeft != null && (
                <div className={styles.meter} aria-hidden="true">
                  <div className={styles.meterFill} style={{ width: `${((FOUNDER_TOTAL - placesLeft) / FOUNDER_TOTAL) * 100}%` }} />
                </div>
              )}
              {placesLeft != null && (
                <p className={styles.small}>{FOUNDER_TOTAL - placesLeft} place{FOUNDER_TOTAL - placesLeft > 1 ? 's' : ''} prise{FOUNDER_TOTAL - placesLeft > 1 ? 's' : ''} sur {FOUNDER_TOTAL}.</p>
              )}
              <Link href={SIGNUP_HREF} className={styles.btn}>Je prends ma place</Link>
            </>
          ) : (
            <p className={styles.small}>Les {FOUNDER_TOTAL} places sont prises. Tu peux toujours ouvrir ta boutique gratuitement.</p>
          )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Questions fréquentes</h2>
          <div className={styles.faq}>
            {QUESTIONS.map((item) => (
              <details className={styles.qa} key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className={`${styles.section} ${styles.final}`}>
          <h2 className={styles.h2}>Prêt à vendre au Gabon ?</h2>
          <p>L&apos;inscription prend 5 minutes. Garde ta pièce d&apos;identité à portée de main.</p>
          <div className={styles.actions}>
            <Link href={SIGNUP_HREF} className={styles.btn}>Ouvrir ma boutique</Link>
            <Link href="/cgu" className={styles.link}>Conditions générales</Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
