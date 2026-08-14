import './globals.css';
import { CartProvider } from '@/context/CartContext';

export const metadata = {
  title: 'WennaShop — Marketplace Gabon ↔ Maroc',
  description: "WennaShop — La marketplace qui connecte le Gabon et le Maroc. Achetez et vendez des produits authentiques.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>
        <CartProvider>
          {children}
          <div id="toast" />
        </CartProvider>
      </body>
    </html>
  );
}
