'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';

// Un visiteur connecté qui ouvre l'accueil (ou l'app installée, start_url « / »)
// garde le parcours d'avant : il passait par /connexion, qui l'envoie sur
// /bienvenue. Les visiteurs non connectés et les moteurs de recherche restent
// sur l'accueil.
export default function HomeSessionRedirect() {
  const router = useRouter();
  useEffect(() => {
    getSupabase().auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/bienvenue');
    });
  }, [router]);
  return null;
}
