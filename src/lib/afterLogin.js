// Page à rouvrir après la connexion : /connexion?next=/panier l'enregistre,
// /bienvenue la consomme une seule fois au lieu de la page d'accueil du rôle.
export const AFTER_LOGIN_KEY = 'wenna_after_login';

export function takeAfterLogin() {
  try {
    const next = sessionStorage.getItem(AFTER_LOGIN_KEY);
    sessionStorage.removeItem(AFTER_LOGIN_KEY);
    return next && next.startsWith('/') && !next.startsWith('//') ? next : null;
  } catch {
    return null;
  }
}
