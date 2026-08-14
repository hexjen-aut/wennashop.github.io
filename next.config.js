/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'aakxoydznmybstfozjte.supabase.co' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self)' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' https://accounts.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com; font-src 'self' https://fonts.gstatic.com https://unpkg.com; img-src 'self' data: https: blob:; connect-src 'self' https://aakxoydznmybstfozjte.supabase.co wss://aakxoydznmybstfozjte.supabase.co https://accounts.google.com; frame-src https://accounts.google.com https://js.cinetpay.com https://paydunia.com; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests;" },
        ],
      },
    ];
  },
  // ─────────────────────────────────────────────────────────
  // Toute ancienne adresse en .html renvoie vers la nouvelle
  // adresse propre, pour ne perdre aucun lien déjà partagé
  // (réseaux sociaux, Google, favoris des clients...).
  // ─────────────────────────────────────────────────────────
  async redirects() {
    return [
      { source: '/index.html', destination: '/', permanent: true },
      { source: '/boutique.html', destination: '/boutique', permanent: true },
      { source: '/detail_produit.html', destination: '/produit', permanent: true },
      { source: '/panier.html', destination: '/panier', permanent: true },
      { source: '/paiement.html', destination: '/paiement', permanent: true },
      { source: '/compte.html', destination: '/compte', permanent: true },
      { source: '/dashboard-vendeur.html', destination: '/vendeur', permanent: true },
      { source: '/admin_panel.html', destination: '/admin', permanent: true },
      { source: '/tracking.html', destination: '/suivi', permanent: true },
      { source: '/recherche.html', destination: '/recherche', permanent: true },
      { source: '/quetes.html', destination: '/quetes', permanent: true },
      { source: '/detail_quete.html', destination: '/quete', permanent: true },
      { source: '/chasseur.html', destination: '/chasseur', permanent: true },
      { source: '/devenir-chasseur.html', destination: '/devenir-chasseur', permanent: true },
      { source: '/boutique-vendeur.html', destination: '/boutique-vendeur', permanent: true },
      { source: '/offline.html', destination: '/offline', permanent: true },
    ];
  },
};

module.exports = nextConfig;
