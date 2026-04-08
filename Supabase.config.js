// ════════════════════════════════════════════════════════
//  WENNASHOP — Configuration Supabase centralisée
//  Fichier : supabase.config.js
//  À placer à la RACINE du projet (même dossier que index.html)
//
//  ⚠️  ÉTAPE OBLIGATOIRE AVANT DE LANCER :
//  1. Aller sur https://supabase.com/dashboard/project/vkevqwfpzywrtvodoqli/settings/api
//  2. Copier la clé "anon / public" (commence par eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...)
//  3. Remplacer VOTRE_CLÉ_ANON_JWT ci-dessous
//  4. NE JAMAIS partager ni committer ce fichier avec la clé service_role
// ════════════════════════════════════════════════════════

const WENNA_CONFIG = {
  supabaseUrl:  'https://vkevqwfpzywrtvodoqli.supabase.co',

  // ⬇️  REMPLACEZ PAR VOTRE VRAIE CLÉ ANON (Settings → API → anon public)
  supabaseKey:  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFha3hveWR6bm15YnN0Zm96anRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MDQxMjAsImV4cCI6MjA5MTE4MDEyMH0.ncjxAvqVrxW75QJ4zcu0StOJsNtEZfY1SD48nRyJCs0',

  // Redirections après auth
  redirectAfterLogin:   'hero.html',
  redirectAfterLogout:  'index.html',
  adminPage:            'admin.html',

  // Paramètres du site
  siteName:             'WennaShop',
  shippingFreeThreshold: 250,
  defaultCurrency:      'EUR',
  promoCode:            'WENNA15',
  promoDiscount:        0.15,
};

// Créer le client Supabase (nécessite le SDK chargé avant ce script)
function createWennaClient() {
  if (!window.supabase) {
    console.error('[WennaShop] SDK Supabase non chargé. Ajoutez le script CDN avant supabase.config.js');
    return null;
  }
  if (WENNA_CONFIG.supabaseKey === 'VOTRE_CLÉ_ANON_JWT') {
    console.warn('[WennaShop] ⚠️ Clé Supabase non configurée. Ouvrez supabase.config.js et remplacez VOTRE_CLÉ_ANON_JWT');
  }
  return window.supabase.createClient(WENNA_CONFIG.supabaseUrl, WENNA_CONFIG.supabaseKey);
}

// Instance globale unique — utilisée par toutes les pages
window.db = createWennaClient();
window.WENNA = WENNA_CONFIG;