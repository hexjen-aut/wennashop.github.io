import { Suspense } from 'react';
import { getServerSupabase } from '@/lib/supabaseServer';
import Content from './BoutiqueVendeurClient';

const SITE_URL = 'https://wennashop.com';

async function getShop(searchParams) {
  const { slug, id, vendeur } = searchParams || {};
  if (!slug && !id && !vendeur) return null;
  const sb = getServerSupabase();
  let q = sb.from('shops').select('name,slug,bio,logo_url,city,country');
  if (slug) q = q.eq('slug', slug);
  else if (id) q = q.eq('id', id);
  else q = q.eq('user_id', vendeur);
  const { data } = await q.eq('status', 'active').maybeSingle();
  return data;
}

export async function generateMetadata({ searchParams }) {
  const shop = await getShop(searchParams);
  if (!shop) return { title: 'Boutique introuvable' };

  const description = shop.bio
    ? shop.bio.slice(0, 160)
    : `Découvrez les produits de ${shop.name} sur WennaShop${shop.city || shop.country ? `, depuis ${[shop.city, shop.country].filter(Boolean).join(', ')}` : ''}.`;

  return {
    title: shop.name,
    description,
    alternates: shop.slug ? { canonical: `${SITE_URL}/boutique-vendeur?slug=${shop.slug}` } : undefined,
    openGraph: {
      type: 'website',
      title: shop.name,
      description,
      images: shop.logo_url ? [{ url: shop.logo_url, alt: shop.name }] : undefined,
    },
  };
}

export default function BoutiqueVendeurPage() {
  return <Suspense fallback={null}><Content /></Suspense>;
}
