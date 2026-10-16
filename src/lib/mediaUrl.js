// Photos des produits servies depuis wennashop.com/media/products/… au lieu
// de l'adresse Supabase : Supabase Storage renvoie « X-Robots-Tag: none »,
// qui interdit à Google d'indexer l'image. La route src/app/media relaie le
// fichier sans cet en-tête. Toute autre adresse est rendue telle quelle.

const PREFIX = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/products/`;
const SITE_URL = 'https://wennashop.com';

export function mediaUrl(url, { absolute = false } = {}) {
  if (typeof url !== 'string' || !url.startsWith(PREFIX)) return url;
  const path = `/media/products/${url.slice(PREFIX.length)}`;
  return absolute ? `${SITE_URL}${path}` : path;
}
