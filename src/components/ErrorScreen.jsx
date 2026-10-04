import Mascot from './Mascot';
import styles from './ErrorScreen.module.css';

// Écran plein page partagé par les pages d'erreur (404, erreur inattendue,
// hors connexion) : logo, Wenna, message et actions.
export default function ErrorScreen({ code, title, text, children }) {
  return (
    <div className={styles.screen}>
      <a href="/boutique" className={styles.logo}>
        <img src="/wenna_icon.png" alt="" className={styles.logoIcon} />
        <span className={styles.logoAccent}>Wenna</span>Shop
      </a>
      <Mascot size={130} float />
      {code && <div className={styles.code}>{code}</div>}
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.text}>{text}</p>
      {children && <div className={styles.actions}>{children}</div>}
    </div>
  );
}
