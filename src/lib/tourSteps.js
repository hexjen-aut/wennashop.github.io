// Tutoriels : à chaque nouveauté sur une page qui a un tutoriel, ajouter ou
// réécrire l'étape concernée et la marquer `since: 'AAAA-MM-JJ'` (date de
// mise en ligne). Quelqu'un qui a déjà fini le tutoriel avant cette date se
// voit proposer seulement ces étapes-là ; un nouveau venu voit tout.

export function tourStepsFor(steps, completedAt) {
  if (!completedAt) return steps;
  const done = new Date(completedAt).getTime();
  return steps.filter((s) => s.since && new Date(`${s.since}T00:00:00Z`).getTime() > done);
}
