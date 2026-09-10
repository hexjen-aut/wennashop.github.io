import { Suspense } from 'react';
import { getServerSupabase } from '@/lib/supabaseServer';
import ProduitContent from './ProduitClient';

const SITE_URL = 'https://wennashop.com';

async function getProduct(id) {
  if (!id) return null;
  const sb = getServerSupabase();
  const { data } = await sb.from('products').select('id,name,description,price,currency,image_url,images,stock,country').eq('id', id).eq('status', 'active').maybeSingle();
  return data;
}

export async function generateMetadata({ searchParams }) {
  const id = searchParams?.id;
  const product = await getProduct(id);
  if (!product) return { title: 'Produit introuvable' };

  const image = product.image_url || product.images?.[0] || '/og-image.png';
  const description = product.description
    ? product.description.slice(0, 160)
    : `${product.name} — ${product.price} ${product.currency || 'MAD'}, vendu sur WennaShop${product.country ? `, en provenance du ${product.country}` : ''}.`;

  return {
    title: product.name,
    description,
    alternates: { canonical: `${SITE_URL}/produit?id=${id}` },
    openGraph: {
      type: 'website',
      title: product.name,
      description,
      url: `${SITE_URL}/produit?id=${id}`,
      images: [{ url: image, alt: product.name }],
    },
    twitter: {
      card: 'summary_large_image',
      title: product.name,
      description,
      images: [image],
    },
  };
}

export default async function ProduitPage({ searchParams }) {
  const product = await getProduct(searchParams?.id);

  const jsonLd = product ? {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description || undefined,
    image: product.image_url || product.images?.[0] || undefined,
    offers: {
      '@type': 'Offer',
      priceCurrency: product.currency || 'MAD',
      price: product.price,
      availability: product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: `${SITE_URL}/produit?id=${product.id}`,
    },
  } : null;

  return (
    <>
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      )}
      <Suspense fallback={null}>
        <ProduitContent />
      </Suspense>
    </>
  );
}
