'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';

const FLAG_KEYS = ['maintenance_mode', 'quests_enabled', 'wallets_enabled', 'boosters_enabled'];

// Par défaut tout est actif (site normal) tant que la config n'a pas encore
// répondu — évite qu'une page se ferme brièvement au premier rendu.
const DEFAULTS = { maintenance_mode: false, quests_enabled: true, wallets_enabled: true, boosters_enabled: true };

const FeatureFlagsContext = createContext(DEFAULTS);

export function FeatureFlagsProvider({ children }) {
  const [flags, setFlags] = useState(DEFAULTS);

  useEffect(() => {
    (async () => {
      const sb = getSupabase();
      const { data } = await sb.from('site_config').select('key,value').in('key', FLAG_KEYS);
      if (!data) return;
      const next = { ...DEFAULTS };
      data.forEach((r) => { next[r.key] = r.value === 'true'; });
      setFlags(next);
    })();
  }, []);

  return <FeatureFlagsContext.Provider value={flags}>{children}</FeatureFlagsContext.Provider>;
}

export function useFeatureFlags() {
  return useContext(FeatureFlagsContext);
}
