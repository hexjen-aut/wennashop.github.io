// Questions fréquentes auxquelles Wenna répond dans le menu d'aide, avant de
// proposer de contacter l'équipe. Les réponses suivent les CGU
// (src/lib/legalTexts.js) et les moyens de paiement actifs par pays
// (tables payment_methods / country_payment_methods) : les mettre à jour
// ensemble si une règle change.
//
// `popular` : affichée d'office à l'ouverture du menu.
// `keywords` : mots qu'un visiteur pourrait taper, en plus de la question.
// `link` : raccourci vers la page concernée.

export const WENNA_FAQ = [
  {
    id: 'commander',
    popular: true,
    q: 'Comment passer commande ?',
    a: "Ouvre la fiche du produit et ajoute-le au panier. Ensuite, ouvre ton panier (icône en haut de l'écran), vérifie les articles et valide : tu choisis ton adresse et ton moyen de paiement. Il faut être connecté pour commander.",
    keywords: 'acheter achat commande panier ajouter valider',
    link: { href: '/boutique', label: 'Aller à la boutique' },
  },
  {
    id: 'paiement',
    popular: true,
    q: 'Quels sont les moyens de paiement ?',
    a: "Au Maroc : paiement à la livraison (espèces) ou virement bancaire. Au Gabon : paiement à la livraison ou Airtel Money (Moov Money arrive bientôt). Au moment de payer, seuls les moyens disponibles pour ton pays s'affichent. Pour Airtel Money ou un virement, envoie le montant exact au numéro ou au RIB affiché sur ta commande avec la référence WN-…, dans les 24 h, puis clique « J'ai payé » et saisis l'ID de transaction. Sans paiement déclaré à temps, la commande est annulée.",
    keywords: 'payer paiement carte bancaire espèces cash livraison virement mobile money airtel moov orange',
  },
  {
    id: 'taille',
    q: 'Comment choisir la taille et le coloris ?',
    a: "Sur la fiche du produit, choisis le coloris (la photo change) puis la taille : le prix s'adapte à la taille, par exemple un XXL peut coûter un peu plus cher. Le bouton « Ajouter au panier » ne marche qu'une fois les deux choisis, et ta commande indique au vendeur exactement ce qu'il doit t'envoyer.",
    keywords: 'taille tailles coloris couleur choisir xl xxl m l pointure variante vêtement',
  },
  {
    id: 'suivi',
    popular: true,
    q: 'Où suivre ma commande ?',
    a: "Touche l'icône colis en haut de l'écran pour ouvrir le suivi : tu vois chaque étape, de la préparation à la livraison. Tes commandes sont aussi listées dans ton compte, rubrique « Mes commandes ».",
    keywords: 'suivre suivi commande colis où est livraison statut',
    link: { href: '/suivi', label: 'Suivre ma commande' },
  },
  {
    id: 'delais',
    popular: true,
    q: 'Combien de temps prend la livraison ?',
    a: "Chaque vendeur indique son délai de livraison sur la fiche produit. Une fois la commande passée, le suivi te montre où elle en est et la date estimée.",
    keywords: 'délai délais temps livraison quand recevoir jours arrive',
  },
  {
    id: 'probleme',
    popular: true,
    q: "Mon colis n'est pas arrivé ou ne correspond pas",
    a: "Signale-le dans les 7 jours après la réception avec « Envoyer une réclamation » (juste en dessous), en indiquant ton numéro de commande et, si le produit est abîmé ou non conforme, des photos. Produit abîmé, non conforme ou non reçu : remboursement intégral, frais de retour compris. Changement d'avis : retour possible sous 7 jours si le produit est intact, renvoi à ta charge. Tout est détaillé dans la Politique de retour (wennashop.com/retours).",
    keywords: 'problème reçu pas arrivé non conforme cassé abîmé défectueux retour rembourser remboursement réclamation litige échange',
    contact: true,
  },
  {
    id: 'annuler',
    q: 'Comment annuler une commande ?',
    a: "Tant que la commande n'est pas expédiée, écris vite à l'équipe sur WhatsApp avec ton numéro de commande : on s'en occupe avec le vendeur.",
    keywords: 'annuler annulation supprimer commande erreur changer',
    contact: true,
  },
  {
    id: 'devise',
    q: 'Pourquoi les prix sont en MAD ou en FCFA ?',
    a: "Les prix s'affichent dans la devise de ton pays, détecté automatiquement d'après ta connexion : dirhams (MAD) au Maroc, francs CFA (FCFA) au Gabon. Pour commander pour un proche dans l'autre pays, touche « Changer de pays » dans la boutique.",
    keywords: 'prix devise monnaie dirham mad fcfa xaf franc cfa pays changer',
  },
  {
    id: 'international',
    q: "Puis-je acheter dans un autre pays ?",
    a: "Oui. Dans la boutique, l'onglet « International » montre les produits d'autres pays dont le vendeur livre chez toi.",
    keywords: 'international étranger autre pays gabon maroc livrer importer',
    link: { href: '/boutique', label: 'Voir la boutique' },
  },
  {
    id: 'quete',
    q: "C'est quoi une quête ?",
    a: "Tu ne trouves pas un produit ? Poste une quête : décris ce que tu cherches et fixe une récompense : au moins 10 % de ton budget (minimum 1 000 FCFA ou 20 MAD), c'est le salaire du chasseur, le produit lui est remboursé à part. Des chasseurs du Gabon et du Maroc le dénichent pour toi. Tu paies produit, transport et récompense en une fois, et WennaShop garde l'argent jusqu'à la livraison.",
    keywords: 'quête quete chercher introuvable trouver demande produit récompense',
    link: { href: '/quetes', label: 'Voir les quêtes' },
  },
  {
    id: 'position',
    q: 'Pourquoi le site me demande ma position au paiement ?',
    a: "Pour lutter contre la fraude : ta position est comparée au pays de livraison, puis effacée après 12 mois. Elle n'est demandée qu'au moment de confirmer, jamais en arrière-plan. Tu peux refuser, ta commande passe quand même ; un agent peut alors t'appeler pour la vérifier.",
    keywords: 'position localisation gps géolocalisation fraude sécurité autorisation pays',
    link: { href: '/confidentialite', label: 'Confidentialité' },
  },
  {
    id: 'confiance',
    q: 'Les vendeurs sont-ils fiables ?',
    a: "Chaque vendeur fournit une pièce d'identité et une adresse, puis l'équipe valide sa boutique avant qu'il puisse vendre. La boutique officielle WennaShop porte un badge dédié.",
    keywords: 'confiance fiable arnaque sécurité sûr vérifié vendeur sérieux',
  },
  {
    id: 'vendre',
    q: 'Comment ouvrir ma boutique ?',
    a: "Inscris-toi gratuitement en choisissant « vendeur », puis fournis une pièce d'identité (CNI ou passeport) et ton adresse. L'équipe valide ta boutique, et tu peux publier tes produits.",
    keywords: 'vendre vendeur devenir boutique ouvrir créer inscription artisan commerçant',
    link: { href: '/vendre', label: 'Vendre sur WennaShop' },
  },
  {
    id: 'fondateur',
    q: "C'est quoi un vendeur fondateur ?",
    a: "Les 20 premières boutiques validées qui mettent un produit en ligne deviennent vendeurs fondateurs : badge « Vendeur fondateur » à vie sur la boutique et ses produits, et 3 mois de mise en avant sur la page d'accueil. La commission ne change pas. Le nombre de places restantes est affiché sur la page Vendre sur WennaShop.",
    keywords: 'fondateur fondateurs 20 premiers vendeurs offre lancement badge mise en avant vedette places',
    link: { href: '/vendre', label: 'Voir les places restantes' },
  },
  {
    id: 'vendre-gabon',
    q: 'Je suis au Maroc, comment vendre au Gabon ?',
    a: "Ouvre ta boutique, puis coche « Gabon » dans les pays où tu expédies (dans Ma boutique, ou produit par produit). Tes produits apparaissent alors chez les acheteurs gabonais, avec le prix converti en FCFA. Tu expédies avec ton transporteur et ajoutes le numéro de suivi ; WennaShop te reverse ta part par virement après la livraison.",
    keywords: 'maroc gabon vendre étranger international expédier export livraison pays fcfa dirham',
    link: { href: '/vendre', label: 'Vendre sur WennaShop' },
  },
  {
    id: 'commission',
    q: 'Combien coûte WennaShop ?',
    a: "L'inscription est gratuite pour tout le monde. Les vendeurs paient seulement une commission sur chaque vente, de 6 à 13 % selon la catégorie du produit. La grille complète est publique, et le taux s'affiche aussi quand tu choisis la catégorie d'un produit.",
    keywords: 'coût prix gratuit commission commissions grille taux frais pourcentage abonnement payer vendeur tarif',
    link: { href: '/commissions', label: 'Voir la grille des commissions' },
  },
  {
    id: 'retrait',
    q: 'Comment retirer mon argent (vendeur) ?',
    a: "Depuis ton tableau de bord vendeur, demande un retrait de ton solde disponible par Mobile Money ou virement bancaire. L'équipe vérifie chaque demande avant le versement.",
    keywords: 'retrait retirer argent solde paiement vendeur virement mobile money gains',
  },
  {
    id: 'equipe',
    q: 'Gérer ma boutique à plusieurs',
    a: "Dans ton tableau de bord, rubrique « Ma boutique », la carte « Équipe de la boutique » permet d'ajouter jusqu'à 10 personnes par leur email. Elles doivent avoir un compte acheteur WennaShop.",
    keywords: 'équipe plusieurs personnes collaborateur employé gérer boutique ajouter membre',
  },
  {
    id: 'chasseur',
    q: 'Comment devenir chasseur ?',
    a: "Ouvre l'onglet « Chasse » (ou la page « Devenir chasseur »), remplis le formulaire et envoie ta pièce d'identité (CNI recto et verso, ou passeport) : l'équipe vérifie sous 48 h. Une fois validé, tu réponds aux quêtes des acheteurs et tu reçois ton code de parrainage pour recruter des vendeurs.",
    keywords: 'chasseur devenir gagner argent parrainage code recruter prime',
    link: { href: '/devenir-chasseur', label: 'Devenir chasseur' },
  },
  {
    id: 'avance',
    q: "Chasseur : est-ce que je dois avancer l'argent du produit ?",
    a: "Par défaut, produit, transport et récompense te sont versés à la livraison. Dès que tu as livré 5 quêtes, tu peux demander une avance : envoie le ticket de caisse et une photo du produit avec le code de la quête écrit à la main. Une fois le ticket validé par l'équipe, le prix du produit t'est versé (au plus le prix de ton offre), puis tu as 72 h pour remettre le colis au transport. Avances en cours : 150 000 FCFA maximum au total.",
    keywords: 'avance ticket caisse chasseur produit payer avancer argent remboursement achat',
    link: { href: '/chasseur', label: 'Mon espace chasseur' },
  },
  {
    id: 'motdepasse',
    q: "J'ai oublié mon mot de passe",
    a: "Sur la page de connexion, saisis ton email puis touche « Oublié ? » à côté du mot de passe. Tu reçois un lien pour en choisir un nouveau ; pense à regarder dans tes spams.",
    keywords: 'mot de passe oublié connexion connecter réinitialiser compte bloqué',
    link: { href: '/connexion', label: 'Page de connexion' },
  },
  {
    id: 'email',
    q: "Je n'ai pas reçu l'email de confirmation",
    a: "Regarde dans tes spams ou l'onglet Promotions, et attends quelques minutes. Vérifie aussi que l'adresse saisie est correcte. Toujours rien ? Contacte l'équipe juste en dessous.",
    keywords: 'email mail confirmation reçu inscription spam valider compte',
    contact: true,
  },
];

function normalize(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ');
}

const INDEX = WENNA_FAQ.map((f) => ({
  faq: f,
  title: normalize(`${f.q} ${f.keywords}`),
  body: normalize(f.a),
}));

// Mots trop courants pour départager les questions (« comment payer » doit
// trouver le paiement, pas « Comment passer commande »).
const STOP_WORDS = new Set(('comment est les des une pour mon mes ton tes son ses que qui quoi quel quelle quels '
  + 'quelles avec dans sur par pas plus veux voudrais peux peut faire fait etre avoir suis ai j est-ce cest '
  + 'quand pourquoi ou moi toi vous nous mais aussi bien tout tous').split(' '));

// Recherche par mots-clés, insensible aux accents. Un mot trouvé dans la
// question ou ses mots-clés compte plus qu'un mot trouvé dans la réponse.
export function searchFaq(query, limit = 5) {
  const words = normalize(query).split(' ').filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  if (!words.length) return [];
  return INDEX
    .map(({ faq, title, body }) => ({
      faq,
      score: words.reduce((s, w) => s + (title.includes(w) ? 2 : body.includes(w) ? 1 : 0), 0),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.faq);
}
