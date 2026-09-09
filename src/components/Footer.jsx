import Link from 'next/link';
import styles from './Footer.module.css';

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <span className={styles.brand}>WennaShop</span>
        <nav className={styles.links}>
          <Link href="/cgu">CGU</Link>
          <Link href="/confidentialite">Confidentialité</Link>
          <Link href="/mentions-legales">Mentions légales</Link>
        </nav>
        <span className={styles.copy}>© {new Date().getFullYear()} Hexjen Conceptions</span>
      </div>
    </footer>
  );
}
