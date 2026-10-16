# WennaShop

## Tutoriels (règle du fondateur)
Chaque nouveauté visible sur une page qui a un tutoriel met à jour ce tutoriel dans la même PR :
- espace chasseur : `HUNTER_TOUR_STEPS` dans `src/app/chasseur/page.jsx`
- admin et agents de paiement : `ADMIN_TOUR_STEPS` et `AGENT_TOUR_STEPS` dans `src/app/admin/guide.js`
- vendeur : `src/app/vendeur/page.jsx` ; boutique : `src/app/boutique/BoutiqueClient.jsx`

Ajoute ou réécris l'étape, et marque-la `since: 'AAAA-MM-JJ'` (date de mise en ligne) là où la page utilise `tourStepsFor` (`src/lib/tourSteps.js`) : ceux qui ont déjà fini le tutoriel revoient seulement ces étapes. Mets aussi à jour les textes liés : CGU (`src/lib/legalTexts.js`), FAQ (`src/lib/wennaFaq.js`), guide de l'équipe (`src/app/admin/guide.js`).
