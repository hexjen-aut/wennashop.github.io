// Réglages du carrousel de la page d'accueil (/connexion), stockés dans
// site_config et modifiés depuis l'admin, section « Vitrine ».
//
// source :
//   'products' : photos des produits en vitrine, puis les mieux notés
//   'custom'   : uniquement les images ajoutées par l'admin
//   'mixed'    : les images de l'admin d'abord, puis les photos produits
// autoplay : false = le carrousel reste sur la première image.

export const CAROUSEL_KEYS = {
  source: 'login_carousel_source',
  autoplay: 'login_carousel_autoplay',
  images: 'login_carousel_images',
};

export const CAROUSEL_BUCKET = 'site-assets';

export const DEFAULT_CAROUSEL = { source: 'products', autoplay: true, images: [] };

// Lien au clic : une page du site (/…) ou une adresse https.
export function isSafeLink(link) {
  return typeof link === 'string' && /^(\/(?!\/)|https:\/\/)\S*$/i.test(link);
}

// rows : lignes { key, value } de site_config.
export function parseCarouselConfig(rows) {
  const map = Object.fromEntries((rows || []).map((r) => [r.key, r.value]));
  let images = [];
  try {
    const parsed = JSON.parse(map[CAROUSEL_KEYS.images] || '[]');
    if (Array.isArray(parsed)) {
      images = parsed
        .filter((i) => i && typeof i.url === 'string' && i.url)
        .map((i) => (isSafeLink(i.link) ? { url: i.url, link: i.link } : { url: i.url }));
    }
  } catch { images = []; }
  const source = ['products', 'custom', 'mixed'].includes(map[CAROUSEL_KEYS.source])
    ? map[CAROUSEL_KEYS.source]
    : DEFAULT_CAROUSEL.source;
  return {
    source,
    autoplay: map[CAROUSEL_KEYS.autoplay] !== 'false',
    images,
  };
}
