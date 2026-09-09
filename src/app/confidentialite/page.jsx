import Link from 'next/link';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import { PRIVACY_TEXT } from '@/lib/legalTexts';

export const metadata = { title: 'Politique de confidentialité — WennaShop' };

export default function ConfidentialitePage() {
  return (
    <>
      <Nav />
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '100px 24px 60px' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Légal</div>
        <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 24 }}>Politique de confidentialité</h1>
        <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.8, whiteSpace: 'pre-line' }}>
          {PRIVACY_TEXT}
        </div>
        <div style={{ marginTop: 40, display: 'flex', gap: 16, fontSize: 12 }}>
          <Link href="/cgu" style={{ color: 'var(--accent)' }}>Conditions générales d’utilisation</Link>
          <Link href="/mentions-legales" style={{ color: 'var(--accent)' }}>Mentions légales</Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
