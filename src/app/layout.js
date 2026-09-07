import './globals.css';
import { CartProvider } from '@/context/CartContext';
import { Analytics } from '@vercel/analytics/next';

const SITE_URL = 'https://wennashop.com';
const SITE_DESCRIPTION = "WennaShop est la marketplace qui connecte les vendeurs et acheteurs entre le Gabon et le Maroc. Achetez et vendez des produits authentiques en toute sécurité.";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'WennaShop — Marketplace Gabon ↔ Maroc', template: '%s — WennaShop' },
  description: SITE_DESCRIPTION,
  keywords: ['marketplace', 'Gabon', 'Maroc', 'e-commerce', 'vendeur', 'boutique en ligne', 'Afrique'],
  manifest: '/manifest.json',
  icons: {
    icon: '/icon-192.png',
    apple: '/icon-192.png',
  },
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    url: SITE_URL,
    siteName: 'WennaShop',
    title: 'WennaShop — Marketplace Gabon ↔ Maroc',
    description: SITE_DESCRIPTION,
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'WennaShop' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'WennaShop — Marketplace Gabon ↔ Maroc',
    description: SITE_DESCRIPTION,
    images: ['/og-image.png'],
  },
};

export const viewport = {
  themeColor: '#ff6800',
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <head>
        {/* Police d'icônes utilisée dans tout le site (panier, recherche, menu...) — auto-hébergée pour ne pas dépendre d'un CDN tiers (lenteur/coupure au premier chargement) */}
        <link rel="stylesheet" href="/phosphor/style.css" />
      </head>
      <body>
        <CartProvider>
          {children}
          <div id="toast" />
        </CartProvider>
        <Analytics />
      </body>
    </html>
  );
}
