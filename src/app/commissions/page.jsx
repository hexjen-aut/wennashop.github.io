import Link from 'next/link';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import { getServerSupabase } from '@/lib/supabaseServer';
import styles from './commissions.module.css';

export const metadata = {
  title: 'Grille des commissions — WennaShop',
  description: "Inscription gratuite : WennaShop prélève une commission uniquement sur chaque vente, selon la catégorie du produit (de 6 à 13 %).",
};

// Relue en base toutes les 10 min : un taux changé dans l'admin apparaît ici
// sans redéploiement.
export const revalidate = 600;

// Taux d'un produit sans catégorie (voir resolve_commission_rate).
const DEFAULT_RATE = 8;

async function loadGrid() {
  try {
    const sb = getServerSupabase();
    const { data, error } = await sb.from('categories')
      .select('id,name,parent_id,commission_rate,sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error || !data) return null;
    const roots = data.filter((c) => !c.parent_id);
    const byRate = {};
    roots.forEach((root) => {
      const rate = root.commission_rate != null ? Number(root.commission_rate) : DEFAULT_RATE;
      const children = data.filter((c) => c.parent_id === root.id).map((c) => c.name).sort((a, b) => a.localeCompare(b, 'fr'));
      (byRate[rate] = byRate[rate] || []).push({ name: root.name, children });
    });
    return Object.keys(byRate).map(Number).sort((a, b) => a - b)
      .map((rate) => ({ rate, categories: byRate[rate].sort((a, b) => a.name.localeCompare(b.name, 'fr')) }));
  } catch {
    return null;
  }
}

export default async function CommissionsPage() {
  const grid = await loadGrid();
  const top = grid?.[grid.length - 1];
  // Exemple chiffré sur la catégorie la plus fournie du taux le plus haut.
  const exampleCat = top ? [...top.categories].sort((a, b) => b.children.length - a.children.length)[0] : null;
  const example = exampleCat ? { name: exampleCat.name, rate: top.rate, fee: Math.round(8000 * top.rate) / 100 } : null;

  return (
    <>
      <Nav />
      <main className={styles.main}>
        <div className={styles.eyebrow}>Vendeurs</div>
        <h1 className={styles.title}>Grille des commissions</h1>
        <p className={styles.intro}>
          L'inscription et la boutique sont gratuites. WennaShop prélève une commission uniquement quand tu vends, selon la catégorie du produit. Elle est calculée sur le prix de vente.
        </p>

        {!grid ? (
          <p className={styles.intro}>La grille est momentanément indisponible. Réessaie dans un instant.</p>
        ) : (
          <div className={styles.grid}>
            {grid.map(({ rate, categories }) => (
              <section key={rate} className={styles.tier}>
                <div className={styles.rate}>{rate} %</div>
                <ul className={styles.list}>
                  {categories.map((c) => (
                    <li key={c.name}>
                      <span className={styles.cat}>{c.name}</span>
                      {c.children.length > 0 && <span className={styles.sub}>{c.children.join(' · ')}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <section className={styles.tier}>
              <div className={styles.rate}>{DEFAULT_RATE} %</div>
              <ul className={styles.list}><li><span className={styles.cat}>Produit sans catégorie</span></li></ul>
            </section>
          </div>
        )}

        <div className={styles.notes}>
          <p>Les sous-catégories suivent le taux de leur catégorie principale.</p>
          {example?.name && (
            <p>Exemple : un article à 8 000 FCFA vendu en « {example.name} » ({example.rate} %) → {example.fee.toLocaleString('fr-FR')} FCFA de commission, {(8000 - example.fee).toLocaleString('fr-FR')} FCFA pour le vendeur.</p>
          )}
          <p>Un taux particulier peut être accordé à une boutique par l'équipe WennaShop ; il s'affiche alors dans son tableau de bord.</p>
        </div>

        <div className={styles.actions}>
          <Link href="/connexion" className={styles.btn}>Ouvrir ma boutique</Link>
          <Link href="/cgu" className={styles.link}>Conditions générales</Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
