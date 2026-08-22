import './globals.css';
import { CartProvider } from '@/context/CartContext';

export const metadata = {
  title: 'WennaShop — Marketplace africain',
  description: "WennaShop — La marketplace qui connecte l'Afrique. Achetez et vendez des produits authentiques.",
  manifest: '/manifest.json',
  icons: {
    icon: '/icon-192.png',
    apple: '/icon-192.png',
  },
};

export const viewport = {
  themeColor: '#ff751f',
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <head>
        {/* Police d'icônes utilisée dans tout le site (panier, recherche, menu...) */}
        <link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/style.css" />
      </head>
      <body>
        <CartProvider>
          {children}
          <div id="toast" />
        </CartProvider>
      </body>
    </html>
  );
}
