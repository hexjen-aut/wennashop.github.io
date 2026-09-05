'use client';

import { createClient } from '@supabase/supabase-js';

// Aucune valeur de repli : un déploiement sans ces variables doit échouer
// bruyamment plutôt que de pointer silencieusement vers la mauvaise instance.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Configuration Supabase manquante : NEXT_PUBLIC_SUPABASE_URL et ' +
    'NEXT_PUBLIC_SUPABASE_ANON_KEY doivent être définies (voir .env.example).'
  );
}

// Une seule connexion partagée par toute l'application
// (équivalent exact de l'ancien window.db)
let browserClient;
export function getSupabase() {
  if (typeof window === 'undefined') {
    // Rendu côté serveur : on crée une connexion jetable, sans session
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  if (!browserClient) {
    browserClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return browserClient;
}
