'use client';

import { usePathname } from 'next/navigation';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';
import styles from './MaintenanceGate.module.css';

// /admin reste toujours accessible, même en maintenance, pour pouvoir
// désactiver le mode maintenance sans passer par la base de données.
export default function MaintenanceGate({ children }) {
  const pathname = usePathname();
  const { maintenance_mode: maintenance } = useFeatureFlags();

  if (!maintenance || pathname?.startsWith('/admin')) return children;

  return (
    <div className={styles.screen}>
      <div className={styles.logo}>
        <img src="/wenna_icon.png" alt="" className={styles.logoIcon} />
        <span className={styles.logoAccent}>Wenna</span>Shop
      </div>
      <div className={styles.title}>Site en maintenance</div>
      <p className={styles.sub}>Nous effectuons des mises à jour. Le site sera de retour très bientôt.</p>
    </div>
  );
}
