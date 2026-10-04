import styles from './Mascot.module.css';

// Wenna, la mascotte WennaShop (public/wenna-mascotte.svg, ratio 240×280).
// `float` ajoute un léger balancement, coupé si l'utilisateur a demandé
// moins d'animations.
export default function Mascot({ size = 64, float = false, className = '', alt = 'Wenna, la mascotte WennaShop' }) {
  return (
    <img
      src="/wenna-mascotte.svg"
      alt={alt}
      width={size}
      height={Math.round((size * 280) / 240)}
      className={`${styles.mascot} ${float ? styles.float : ''} ${className}`}
      draggable={false}
    />
  );
}
