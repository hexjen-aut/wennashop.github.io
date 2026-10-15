'use client';

import { openConsentSettings } from '@/lib/consent';

// Lien « Gérer les cookies » : rouvre le bandeau pour changer son choix.
export default function ConsentSettingsLink({ className, style }) {
  return (
    <button
      type="button"
      onClick={openConsentSettings}
      className={className}
      style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer', ...style }}
    >
      Gérer les cookies
    </button>
  );
}
