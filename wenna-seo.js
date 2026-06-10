/**
 * WennaShop — Module SEO Dynamique
 * Gère : meta tags, Open Graph, Twitter Cards, JSON-LD, canonical
 * Usage : inclure dans chaque page AVANT le contenu
 */

const WennaSEO = (() => {

  // ─── CONFIG DE BASE ───────────────────────────────────────────────
  const BASE = {
    siteName:    'WennaShop',
    baseUrl:     'https://wennashop.netlify.app',
    defaultDesc: 'WennaShop — La marketplace qui connecte le Gabon et le Maroc. Achetez et vendez des produits authentiques entre Libreville et Casablanca.',
    defaultImg:  'https://wennashop.netlify.app/assets/og-default.jpg',
    locale:      'fr_FR',
    twitterSite: '@wennashop',
    themeColor:  '#ff751f',
  };

  function setMeta(name, content, attr = 'name') {
    if (!content) return;
    let el = document.querySelector(`meta[${attr}="${name}"]`);
    if (!el) { el = document.createElement('meta'); el.setAttribute(attr, name); document.head.appendChild(el); }
    el.setAttribute('content', content);
  }

  function setLink(rel, href) {
    if (!href) return;
    let el = document.querySelector(`link[rel="${rel}"]`);
    if (!el) { el = document.createElement('link'); el.setAttribute('rel', rel); document.head.appendChild(el); }
    el.setAttribute('href', href);
  }

  function setJsonLd(data) {
    let el = document.querySelector('script[type="application/ld+json"]#wenna-jsonld');
    if (!el) { el = document.createElement('script'); el.type = 'application/ld+json'; el.id = 'wenna-jsonld'; document.head.appendChild(el); }
    el.textContent = JSON.stringify(data);
  }

  function truncate(str, len = 160) { if (!str) return ''; return str.length > len ? str.substring(0, len - 3) + '...' : str; }
  function slugify(str) { return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  function applyBase() {
    setMeta('theme-color', BASE.themeColor);
    setMeta('og:site_name', BASE.siteName, 'property');
    setMeta('og:locale', BASE.locale, 'property');
    setMeta('og:type', 'website', 'property');
    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:site', BASE.twitterSite);
    setMeta('robots', 'index, follow');
    setLink('canonical', window.location.origin + window.location.pathname);
  }

  function applyIndex({ topCategories = [], featuredProducts = [] } = {}) {
    const title = 'WennaShop — Marketplace Gabon ↔ Maroc';
    const desc = truncate(BASE.defaultDesc);
    document.title = title;
    setMeta('description', desc);
    setMeta('keywords', 'marketplace gabon maroc, acheter gabon, vendre maroc, produits africains, wennashop, commerce gabon maroc, libreville casablanca');
    setMeta('og:title', title, 'property'); setMeta('og:description', desc, 'property');
    setMeta('og:url', BASE.baseUrl, 'property'); setMeta('og:image', BASE.defaultImg, 'property');
    setMeta('twitter:title', title); setMeta('twitter:description', desc); setMeta('twitter:image', BASE.defaultImg);
    setJsonLd({ '@context': 'https://schema.org', '@type': 'WebSite', name: BASE.siteName, url: BASE.baseUrl, description: BASE.defaultDesc, inLanguage: 'fr', potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: `${BASE.baseUrl}/boutique.html?q={search_term_string}` }, 'query-input': 'required name=search_term_string' } });
  }

  function applyBoutique({ category = null, filters = {}, totalProducts = 0 } = {}) {
    let title, desc, keywords;
    if (category) {
      const catName = category.charAt(0).toUpperCase() + category.slice(1);
      title = `${catName} — WennaShop Marketplace Gabon Maroc`;
      desc = truncate(`Découvrez nos produits ${catName.toLowerCase()} sur WennaShop. ${totalProducts} articles disponibles.`);
      keywords = `${catName.toLowerCase()} gabon, ${catName.toLowerCase()} maroc, acheter ${catName.toLowerCase()} wennashop`;
    } else {
      title = 'Boutique — Tous les Produits | WennaShop';
      desc = truncate(`Explorez ${totalProducts > 0 ? totalProducts + ' produits' : 'tous nos produits'} sur WennaShop. Mode, électronique, alimentation entre le Gabon et le Maroc.`);
      keywords = 'boutique wennashop, produits gabon maroc, marketplace africaine, acheter en ligne gabon';
    }
    if (filters.pays) keywords += `, produits ${filters.pays}`;
    const canonicalPath = category ? `/boutique.html?categorie=${slugify(category)}` : '/boutique.html';
    document.title = title; setMeta('description', desc); setMeta('keywords', keywords);
    setLink('canonical', BASE.baseUrl + canonicalPath);
    setMeta('og:title', title, 'property'); setMeta('og:description', desc, 'property');
    setMeta('og:url', BASE.baseUrl + canonicalPath, 'property'); setMeta('og:image', BASE.defaultImg, 'property');
    setMeta('twitter:title', title); setMeta('twitter:description', desc);
    setJsonLd({ '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, description: desc, url: BASE.baseUrl + canonicalPath, numberOfItems: totalProducts });
  }

  function applyProduit(product = {}) {
    if (!product || !product.nom) return;
    const { id, nom, description, prix, devise = 'MAD', categorie, vendeur_nom, pays_origine, images = [], stock = 1, note_moyenne, nombre_avis } = product;
    const title = truncate(`${nom} | WennaShop${pays_origine ? ' — ' + pays_origine : ''}`, 70);
    const desc = truncate(description || `Achetez ${nom} sur WennaShop. ${prix ? `Prix : ${prix} ${devise}.` : ''} Marketplace Gabon ↔ Maroc.`);
    const imgUrl = images.length > 0 ? (images[0].startsWith('http') ? images[0] : BASE.baseUrl + images[0]) : BASE.defaultImg;
    const pageUrl = `${BASE.baseUrl}/detail_produit.html?id=${id}`;
    document.title = title; setMeta('description', desc);
    setMeta('keywords', [nom.toLowerCase(), categorie, 'wennashop', pays_origine ? `produits ${pays_origine.toLowerCase()}` : '', 'marketplace gabon maroc'].filter(Boolean).join(', '));
    setLink('canonical', pageUrl);
    setMeta('og:type', 'product', 'property'); setMeta('og:title', title, 'property'); setMeta('og:description', desc, 'property');
    setMeta('og:url', pageUrl, 'property'); setMeta('og:image', imgUrl, 'property');
    if (prix) setMeta('product:price:amount', String(prix), 'property');
    if (devise) setMeta('product:price:currency', devise, 'property');
    setMeta('twitter:title', title); setMeta('twitter:description', desc); setMeta('twitter:image', imgUrl);
    let el = document.querySelector('script#wenna-jsonld-breadcrumb');
    if (!el) { el = document.createElement('script'); el.type = 'application/ld+json'; el.id = 'wenna-jsonld-breadcrumb'; document.head.appendChild(el); }
    el.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Accueil', item: BASE.baseUrl }, { '@type': 'ListItem', position: 2, name: 'Boutique', item: `${BASE.baseUrl}/boutique.html` }, ...(categorie ? [{ '@type': 'ListItem', position: 3, name: categorie, item: `${BASE.baseUrl}/boutique.html?categorie=${slugify(categorie)}` }] : []), { '@type': 'ListItem', position: categorie ? 4 : 3, name: nom, item: pageUrl }] });
    setJsonLd({ '@context': 'https://schema.org', '@type': 'Product', name: nom, description: desc, image: images.length > 0 ? images.map(i => i.startsWith('http') ? i : BASE.baseUrl + i) : [BASE.defaultImg], url: pageUrl, brand: vendeur_nom ? { '@type': 'Brand', name: vendeur_nom } : undefined, offers: { '@type': 'Offer', priceCurrency: devise, price: prix, availability: stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', seller: vendeur_nom ? { '@type': 'Organization', name: vendeur_nom } : undefined, url: pageUrl }, ...(note_moyenne && nombre_avis ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: note_moyenne, reviewCount: nombre_avis } } : {}) });
  }

  function applyPage({ title, description, path, noIndex = false } = {}) {
    const fullTitle = title ? `${title} | WennaShop` : 'WennaShop';
    const desc = truncate(description || BASE.defaultDesc);
    document.title = fullTitle; setMeta('description', desc);
    if (noIndex) setMeta('robots', 'noindex, nofollow');
    setMeta('og:title', fullTitle, 'property'); setMeta('og:description', desc, 'property');
    setMeta('og:url', BASE.baseUrl + (path || window.location.pathname), 'property'); setMeta('og:image', BASE.defaultImg, 'property');
    setMeta('twitter:title', fullTitle); setMeta('twitter:description', desc);
  }

  function autoInit() {
    applyBase();
    const page = window.location.pathname.split('/').pop() || 'index.html';
    if (page === 'index.html' || page === '') applyIndex();
    else if (page === 'boutique.html') applyBoutique();
    else if (page === 'dashboard-vendeur.html') applyPage({ title: 'Dashboard Vendeur', noIndex: true });
    else if (page === 'compte.html') applyPage({ title: 'Mon Compte', noIndex: true });
    else if (page === 'panier.html') applyPage({ title: 'Mon Panier', noIndex: true });
    else if (page === 'paiement.html') applyPage({ title: 'Paiement', noIndex: true });
    else if (page === 'tracking.html') applyPage({ title: 'Suivi de commande', noIndex: true });
    else if (page === 'recherche.html') applyPage({ title: 'Recherche', path: '/recherche.html' });
  }

  return { init: autoInit, index: (d) => { applyBase(); applyIndex(d); }, boutique: (d) => { applyBase(); applyBoutique(d); }, produit: (d) => { applyBase(); applyProduit(d); }, page: (d) => { applyBase(); applyPage(d); } };
})();

document.addEventListener('DOMContentLoaded', () => {
  const page = window.location.pathname.split('/').pop() || 'index.html';
  if (!['detail_produit.html', 'boutique.html', 'index.html'].includes(page)) WennaSEO.init();
});
