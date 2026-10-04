import ErrorScreen from '@/components/ErrorScreen';
import styles from '@/components/ErrorScreen.module.css';

export default function OfflinePage() {
  return (
    <ErrorScreen
      title="Tu es hors connexion"
      text="Pas d'inquiétude, ton panier est sauvegardé. Dès que la connexion revient, tout se resynchronise automatiquement."
    >
      <a href="/boutique" className={styles.btn}>Réessayer</a>
    </ErrorScreen>
  );
}
