'use client';

import { createClient } from '@supabase/supabase-js';

// Mêmes identifiants que l'ancien site (Supabase.config.js)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://aakxoydznmybstfozjte.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFha3hveWR6bm15YnN0Zm96anRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MDQxMjAsImV4cCI6MjA5MTE4MDEyMH0.ncjxAvqVrxW75QJ4zcu0StOJsNtEZfY1SD48nRyJCs0';

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
