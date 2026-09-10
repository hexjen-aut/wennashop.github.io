import { createClient } from '@supabase/supabase-js';

// Pour les Server Components (generateMetadata, sitemap...) : src/lib/supabase.js
// est 'use client' et ne peut pas y être importé. Connexion jetable, sans session.
export function getServerSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
