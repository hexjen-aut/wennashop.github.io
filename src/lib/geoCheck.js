// Libellés du contrôle du pays des commandes (table order_geo_checks,
// remplie par la fonction order-geo-check au paiement). Utilisés par la
// fiche paiement de l'agent et la liste des commandes de l'admin.

export const GEO_REASON_LABEL = {
  device_country_differs: "La position de l'appareil n'est pas dans le pays de livraison",
  device_position_refused: "Le client a refusé de donner la position de son appareil",
  ip_country_differs: 'La connexion internet vient d’un autre pays que la livraison',
  country_changed_by_visitor: 'Le client a changé de pays lui-même sur le site',
};

export const GEO_DEVICE_LABEL = {
  match: 'Dans le pays de livraison',
  mismatch: 'Hors du pays de livraison',
  denied: 'Refusée par le client',
  unavailable: 'Indisponible (appareil ou délai)',
};

export function geoVerdict(check) {
  if (!check) return { label: 'Pas de contrôle', tone: 'muted' };
  return check.risk === 'a_verifier' ? { label: 'À vérifier', tone: 'warn' } : { label: 'Cohérent', tone: 'ok' };
}
