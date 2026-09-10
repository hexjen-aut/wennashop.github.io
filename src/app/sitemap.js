import { getServerSupabase } from '@/lib/supabaseServer';

const SITE_URL = 'https://wennashop.com';

const STATIC_ROUTES = [
  { path: '/', priority: 1, changeFrequency: 'daily' },
  { path: '/boutique', priority: 0.9, changeFrequency: 'daily' },
  { path: '/recherche', priority: 0.6, changeFrequency: 'daily' },
  { path: '/quetes', priority: 0.5, changeFrequency: 'daily' },
  { path: '/devenir-chasseur', priority: 0.4, changeFrequency: 'monthly' },
  { path: '/connexion', priority: 0.3, changeFrequency: 'monthly' },
  { path: '/cgu', priority: 0.2, changeFrequency: 'yearly' },
  { path: '/confidentialite', priority: 0.2, changeFrequency: 'yearly' },
  { path: '/mentions-legales', priority: 0.2, changeFrequency: 'yearly' },
];

export default async function sitemap() {
  const sb = getServerSupabase();

  const entries = STATIC_ROUTES.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: new Date(),
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  const { data: products } = await sb
    .from('products')
    .select('id,updated_at')
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(2000);

  for (const p of products || []) {
    entries.push({
      url: `${SITE_URL}/produit?id=${p.id}`,
      lastModified: p.updated_at ? new Date(p.updated_at) : new Date(),
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
      lastModified: s.updated_at ? new Date(s.updated_at) : new Date(),
      changeFrequency: 'weekly',
      priority: 0.6,
    });
  }

  return entries;
}
