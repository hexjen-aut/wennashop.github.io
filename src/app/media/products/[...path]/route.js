// Relais des photos produits (voir src/lib/mediaUrl.js). Lecture seule du
// bucket public « products », images uniquement. Les noms de fichiers sont
// uniques (horodatés) : le CDN de Vercel garde chaque image un an.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

export async function GET(_req, { params }) {
  const parts = params.path || [];
  if (!parts.length || parts.some((p) => !p || p === '.' || p === '..' || p.includes('\\'))) {
    return new Response('Not found', { status: 404 });
  }
  const upstream = await fetch(
    `${SUPABASE_URL}/storage/v1/object/public/products/${parts.map(encodeURIComponent).join('/')}`,
    { cache: 'no-store' },
  );
  const type = upstream.headers.get('content-type') || '';
  if (!upstream.ok || !type.startsWith('image/')) {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'public, s-maxage=60' } });
  }
  return new Response(upstream.body, {
    headers: {
      'Content-Type': type,
      'Cache-Control': 'public, max-age=86400, s-maxage=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
