// Règles des quêtes, reprises de la base (quest_min_reward, submit_purchase_proof),
// qui fait foi. Réglages dans site_config : quest_reward_min_pct,
// quest_reward_floor_xaf / _mad, quest_advance_min_quests, quest_advance_cap_xaf,
// quest_handover_hours.

export const REWARD_MIN_PCT = 10;
const REWARD_FLOOR = { FCFA: 1000, XAF: 1000, XOF: 1000, MAD: 20 };

// Récompense minimum : 10 % du prix (budget, puis prix de l'offre), avec un plancher
export function minReward(base, currency) {
  const floor = REWARD_FLOOR[String(currency || '').toUpperCase()] ?? REWARD_FLOOR.FCFA;
  return Math.max(floor, Math.ceil((Math.max(Number(base) || 0, 0) * REWARD_MIN_PCT) / 100));
}

// Récompense réellement payée pour une offre (relevée si l'offre dépasse le budget)
export function paidReward(questReward, proposedPrice, currency) {
  return Math.max(Number(questReward) || 0, minReward(proposedPrice, currency));
}

// Code à écrire sur le papier photographié avec le produit
export function questProofCode(proposalId) {
  return `WN-Q${String(proposalId || '').slice(0, 5).toUpperCase()}`;
}

export const ADVANCE_ERRORS = {
  proposal_not_selected: "L'avance se demande avant l'envoi du colis, une fois l'offre payée.",
  order_not_paid: "Le paiement de l'acheteur n'est pas encore confirmé.",
  hunter_not_verified: 'Ton dossier chasseur doit être validé.',
  invalid_amount: 'Indique le montant du ticket.',
  invalid_proof_path: 'Photos invalides, renvoie-les.',
  proof_already_sent: 'Un ticket est déjà envoyé pour cette quête.',
  advance_not_eligible: "L'avance est réservée aux chasseurs qui ont déjà livré 5 quêtes.",
  advance_cap_reached: "Plafond d'avances atteint : attends la livraison de tes colis en cours.",
  fx_rate_missing: 'Taux de change indisponible, réessaie plus tard.',
};
