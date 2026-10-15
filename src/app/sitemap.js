import { getServerSupabase } from '@/lib/supabaseServer';

const SITE_URL = 'https://wennashop.com';

// Pages publiques uniquement (réponse 200, sans redirection). Les pages de
// compte (/connexion, /panier, /paiement, /suivi, /compte, /vendeur, /admin)
// sont en noindex et n'ont rien à faire ici.
// `updated` = date de la dernière vraie modification de la page (pour les
// textes légaux, la date « Dernière mise à jour » du texte) : à changer quand
// la page change. `catalog: true` = la date suit aussi le dernier produit modifié.
const STATIC_ROUTES = [
  { path: '/', priority: 1, changeFrequency: 'daily', updated: '2026-10-15', catalog: true },
  { path: '/boutique', priority: 0.9, changeFrequency: 'daily', updated: '2026-10-13', catalog: true },
  { path: '/recherche', priority: 0.6, changeFrequency: 'daily', updated: '2026-10-13', catalog: true },
  { path: '/quetes', priority: 0.5, changeFrequency: 'daily', updated: '2026-10-15' },
  { path: '/devenir-chasseur', priority: 0.4, changeFrequency: 'monthly', updated: '2026-10-14' },
  { path: '/commissions', priority: 0.4, changeFrequency: 'monthly', updated: '2026-10-05' },
  { path: '/cgu', priority: 0.2, changeFrequency: 'yearly', updated: '2026-10-15' },
  { path: '/confidentialite', priority: 0.2, changeFrequency: 'yearly', updated: '2026-10-14' },
  { path: '/mentions-legales', priority: 0.2, changeFrequency: 'yearly', updated: '2026-10-14' },
  { path: '/retours', priority: 0.3, changeFrequency: 'yearly', updated: '2026-10-15' },
];

const latest = (...dates) => new Date(Math.max(...dates.filter(Boolean).map((d) => new Date(d).getTime())));

export default async function sitemap() {
  const sb = getServerSupabase();

  const { data: products } = await sb
    .from('products')
    .select('id,updated_at')
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(2000);

  const catalogUpdated = products?.[0]?.updated_at;
  const entries = STATIC_ROUTES.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: r.catalog ? latest(r.updated, catalogUpdated) : new Date(r.updated),
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  for (const p of products || []) {
    entries.push({
      url: `${SITE_URL}/produit?id=${p.id}`,
      lastModified: p.updated_at ? new Date(p.updated_at) : undefined,
      changeFrequency: 'weekly',
      priority: 0.7,
    });
  }

  const { data: shops } = await sb
    .from('shops')
    .select('slug,updated_at')
    .eq('status', 'active')
    .not('slug', 'is', null)
    .limit(2000);

  for (const s of shops || []) {
    entries.push({
      url: `${SITE_URL}/boutique-vendeur?slug=${s.slug}`,
      lastModified: s.updated_at ? new Date(s.updated_at) : undefined,
      changeFrequency: 'weekly',
      priority: 0.6,
    });
  }

  return entries;
}
