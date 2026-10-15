// Contenu du guide de l'équipe (admins et agents de paiement) et des deux
// visites guidées. Un seul endroit à mettre à jour quand un écran change.

// Visite de l'admin : chaque étape vise une entrée de la barre latérale
// (id « tour-admin-nav-<clé> »).
export const ADMIN_TOUR_STEPS = [
  { targetId: 'tour-admin-nav-dashboard', title: 'Dashboard', text: "Les chiffres du jour : revenus, commandes, inscrits et ce qui attend une validation." },
  { targetId: 'tour-admin-nav-validation', title: 'Validation des produits', text: "Chaque produit ajouté par un vendeur arrive ici. Il n'apparaît dans la boutique qu'une fois approuvé." },
  { targetId: 'tour-admin-nav-artisans', title: 'Artisans (vendeurs)', text: "Les nouveaux vendeurs envoient leur pièce d'identité. Tu la vérifies, puis tu valides ou refuses avec un motif." },
  { targetId: 'tour-admin-nav-chasseurs', title: 'Chasseurs', text: 'Même principe pour les chasseurs : pièce d\'identité, puis validation ou refus.' },
  { targetId: 'tour-admin-nav-orders', title: 'Commandes', text: "Toutes les commandes. Le statut avance tout seul (paiement validé, expédition par le vendeur) : n'y touche qu'en cas de litige." },
  { targetId: 'tour-admin-nav-verif', title: 'Vérification des paiements', text: "Airtel Money, Moov Money et virement : les clients déclarent leur paiement, l'équipe vérifie sur le relevé et valide ou refuse." },
  { targetId: 'tour-admin-nav-compta', title: 'Comptabilité', text: "Le résultat du mois, les espèces à récupérer chez les livreurs, les reversements aux vendeurs et chasseurs, les dépenses. Chaque mouvement est écrit au grand livre." },
  { targetId: 'tour-admin-nav-payouts', title: 'Retraits et recharges', text: "Les recharges de portefeuille (référence RCH-…) et les demandes de retrait des vendeurs." },
  { targetId: 'tour-admin-nav-users', title: 'Utilisateurs', text: "La liste des comptes. C'est ici que tu nommes un agent de paiement." },
  { targetId: 'tour-admin-nav-pays', title: 'Pays', text: "Moyens de paiement par pays et comptes de réception (numéro, titulaire). Un moyen sans compte n'est pas proposé au client." },
  { targetId: 'tour-admin-nav-settings', title: 'Paramètres', text: 'Mode maintenance, fonctionnalités, taux de change et marge, tarifs transport.' },
  { targetId: 'tour-admin-nav-guide', title: 'Guide', text: "Toutes les procédures pas à pas pour l'équipe. Tu peux relancer cette visite depuis le guide." },
];

// Visite de /admin/paiements pour les agents (et les admins qui y passent).
export const AGENT_TOUR_STEPS = [
  { targetId: 'tour-agent-tabs', title: 'Les onglets', text: "« À vérifier » : les clients qui disent avoir payé. « En attente client » : pas encore déclaré. « Validés » et « Refusés » : l'historique." },
  { targetId: 'tour-agent-table', title: 'La file', text: "Le plus ancien en premier. Au-delà de 2 h, la ligne passe en rouge. Clique sur une ligne pour ouvrir la fiche du paiement." },
  { targetId: 'tour-agent-summary', title: 'Clôture du jour', text: "Le total validé par moyen de paiement. Compare-le chaque soir avec le relevé Airtel, Moov ou bancaire." },
  { targetId: 'tour-agent-guide', title: 'Le guide', text: 'La procédure complète de vérification, à relire en cas de doute.' },
];

// Procédures. `who` : 'agent' (agents et admins) ou 'admin' (admins seuls).
export const GUIDE = [
  {
    id: 'acces',
    who: 'agent',
    title: "Se connecter",
    steps: [
      "Admin : ouvre wennashop.com/admin avec ton e-mail et ton mot de passe d'administrateur.",
      "Sur un nouvel appareil, un code arrive par e-mail : saisis-le. L'appareil est ensuite reconnu pendant 90 jours.",
      "Agent de paiement : connecte-toi sur wennashop.com/connexion, puis ouvre wennashop.com/admin/paiements. C'est la seule page de l'équipe à laquelle tu as accès.",
    ],
    note: "Ne partage jamais ton mot de passe ni le code reçu par e-mail. Chaque personne a son propre compte.",
  },
  {
    id: 'verifier-paiement',
    who: 'agent',
    title: 'Vérifier un paiement (Airtel Money, Moov Money, virement)',
    steps: [
      "Ouvre Vérification des paiements, onglet « À vérifier ». Traite toujours le plus ancien d'abord (en rouge au-delà de 2 h).",
      "Clique sur la ligne. La fiche affiche le montant attendu, la référence WN-…, l'ID de transaction et le numéro d'envoi déclarés par le client, et la capture s'il en a joint une.",
      "Ouvre le relevé du compte de réception (application Airtel ou Moov, ou relevé bancaire) et cherche cet ID de transaction.",
      "Contrôle : la transaction existe, le montant reçu est au moins égal au montant attendu, l'argent est bien arrivé sur le compte WennaShop.",
      "Tout est bon : saisis le montant réellement reçu, puis « Valider le paiement ». La commande passe en préparation et le vendeur est prévenu.",
      "Transaction introuvable, montant incorrect ou ID déjà utilisé : choisis le motif, puis « Refuser ». Le client voit le motif et dispose de 12 h de plus pour corriger.",
      "Tu as un doute (opérateur lent, relevé pas encore à jour) : « Mettre en attente ». Le paiement reste dans « À vérifier », marqué « attente ».",
    ],
    note: "On ne valide jamais sans avoir vu la transaction sur le relevé. Un montant reçu inférieur est bloqué automatiquement. Tu ne peux pas vérifier ton propre paiement.",
  },
  {
    id: 'cloture',
    who: 'agent',
    title: 'Clôture du jour',
    steps: [
      "En fin de journée, regarde « Clôture du jour » en bas de la page de vérification.",
      "Pour chaque moyen, compare « encaissé » avec les entrées du jour sur le compte Airtel, Moov ou bancaire.",
      "Un écart : note la référence WN-… concernée et préviens un admin.",
      "Vérifie qu'il ne reste rien dans « À vérifier » avant de partir.",
    ],
  },
  {
    id: 'cas-agent',
    who: 'agent',
    title: 'Cas particuliers',
    steps: [
      "Le client dit avoir payé mais rien n'apparaît dans « À vérifier » : il n'a pas déclaré son paiement. Il doit ouvrir sa commande (lien reçu par notification) et cliquer sur « J'ai payé ».",
      "L'argent est arrivé mais le paiement a expiré (24 h sans déclaration) : ne valide rien, la commande a été annulée. Préviens un admin avec la référence, l'ID de transaction et le montant.",
      "Deux clients donnent le même ID de transaction : le second est bloqué automatiquement. Vérifie sur le relevé à qui appartient la transaction.",
      "Le client a payé un montant supérieur : valide avec le montant réellement reçu et préviens un admin pour le remboursement de la différence.",
    ],
  },
  {
    id: 'tickets-chasseurs',
    who: 'agent',
    title: "Vérifier un ticket de caisse (avance au chasseur)",
    steps: [
      "Un chasseur qui a déjà livré 5 quêtes peut demander le prix du produit dès l'achat. Ouvre Vérification des paiements, puis « Tickets chasseurs », onglet « À vérifier ».",
      "Clique sur la ligne. La fiche montre le ticket, la photo du produit, le code attendu (WN-Q…), le prix de l'offre et l'avance calculée (le plus petit entre le ticket et l'offre).",
      "Contrôle : magasin et date lisibles, date après le paiement de l'acheteur, montant cohérent avec le produit, code écrit à la main à côté du produit, produit conforme à l'offre.",
      "Tout est bon : « Valider l'avance ». L'avance devient disponible dans Comptabilité, onglet Chasseurs : verse-la depuis cet onglet. Le chasseur a 72 h pour remettre le colis au transport.",
      "Un doute ou une incohérence : choisis le motif puis « Refuser ». Le chasseur peut renvoyer un ticket, ou être payé à la livraison comme d'habitude.",
      "Onglet « Colis en retard » : avance versée, colis pas envoyé après 72 h. Appelle le chasseur, et préviens un admin s'il ne répond pas.",
    ],
    note: "Plafond : 150 000 FCFA d'avances en cours par chasseur, contrôlé automatiquement. Si la commande est ensuite annulée ou retournée, l'avance repasse en dette du chasseur et se retient sur ses gains suivants.",
  },
  {
    id: 'vendeurs',
    who: 'admin',
    title: 'Valider un vendeur ou un chasseur',
    steps: [
      "Ouvre Artisans (vendeurs) ou Chasseurs. Les dossiers en attente sont en haut.",
      "Ouvre le recto et le verso de la pièce d'identité. Vérifie que le nom correspond au compte, que la pièce est lisible et non expirée, et que l'adresse est renseignée.",
      "Si la vérification automatique est active, son résultat s'affiche (en cours, refusée, à revoir) : lis le motif avant de décider.",
      "« Valider » : la personne est prévenue et peut créer sa boutique ou commencer les quêtes.",
      "« Rejeter » : écris un motif clair, la personne le voit et peut renvoyer son dossier.",
    ],
  },
  {
    id: 'produits',
    who: 'admin',
    title: 'Valider les produits',
    steps: [
      "Ouvre Validation. Chaque produit en attente affiche sa photo, son vendeur et son prix.",
      "Contrôle : photo nette (fond blanc si l'option est active), nom et description clairs, prix cohérent, bonne catégorie, produit autorisé.",
      "« Approuver » : le produit apparaît dans la boutique et dans la boutique du vendeur.",
      "« Rejeter » : le produit reste masqué. Préviens le vendeur de ce qu'il doit corriger.",
    ],
    note: "Une boutique sans produit approuvé paraît vide aux clients, même si elle est validée.",
  },
  {
    id: 'commandes',
    who: 'admin',
    title: 'Suivre les commandes',
    steps: [
      "Le statut avance tout seul : « En attente » jusqu'au paiement, « En cours » (en préparation) une fois le paiement validé ou tout de suite pour le paiement à la livraison, puis « Expédié » et « Livré » par le vendeur.",
      "Ne passe jamais une commande « En cours » à la main sans paiement validé : le vendeur préparerait une commande non payée.",
      "Un virement, Airtel Money ou Moov Money se valide dans Vérification paiements, jamais en changeant le statut de la commande.",
      "Change le statut à la main seulement en cas de litige ou d'erreur d'un vendeur.",
    ],
  },
  {
    id: 'encaissements',
    who: 'admin',
    title: 'Paiement à la livraison : récupérer l\'argent',
    steps: [
      "Le livreur (local ou Ozone) encaisse pour Wenna. Rien n'est compté tant que l'argent n'est pas confirmé.",
      "Ouvre Comptabilité → Encaissements. Sur la commande expédiée ou livrée, clique « Argent récupéré ».",
      "Indique qui détient l'argent (ex. « Ozone », « Livreur local »), ses frais de livraison s'il les a retenus (20 à 30 DH en local, environ 50 DH chez Ozone, 2 000 à 3 000 FCFA au Gabon) et la référence du bordereau.",
      "Une fois la commande livrée, la vente, la commission et la part du vendeur sont écrites automatiquement.",
      "Quand Ozone vire l'argent sur le RIB (ou qu'un livreur remet les espèces), enregistre-le dans Comptabilité → Caisse → Remise de fonds.",
    ],
    note: "Les frais retenus sont enregistrés comme dépense « Livraison » : ils réduisent la marge du mois.",
  },
  {
    id: 'reversements',
    who: 'admin',
    title: 'Reverser un vendeur',
    steps: [
      "Ouvre Comptabilité → Reversements vendeurs. Le solde de chaque boutique = ses parts sur les ventes livrées et encaissées, moins ce qui lui a déjà été reversé.",
      "« Préparer les reversements du jour » fige le montant dû à date pour chaque vendeur (facultatif, utile pour un reversement hebdomadaire).",
      "Envoie le montant au vendeur (virement ou Mobile Money), puis « Marquer payé » : montant, référence de l'envoi, compte d'où part l'argent et justificatif.",
      "L'écriture de reversement est créée et le vendeur est notifié. Une erreur se corrige avec « Correction » dans le Grand livre, jamais en effaçant.",
    ],
  },
  {
    id: 'depenses',
    who: 'admin',
    title: 'Enregistrer les dépenses',
    steps: [
      "Comptabilité → Dépenses. Les abonnements (Claude, Supabase…) sont des modèles : chaque mois, renseigne le montant facturé puis « Enregistrer pour ce mois ».",
      "Toute autre dépense : « Ajouter une dépense », avec le fournisseur, la catégorie, le montant, qui a payé et la facture en justificatif.",
      "Le Tableau de bord montre ensuite la marge nette du mois : commissions + marge de change − parrainage − dépenses.",
    ],
    note: "Export CSV ou Excel de toute la période dans le Grand livre, pour le comptable.",
  },
  {
    id: 'retraits',
    who: 'admin',
    title: 'Recharges et retraits des portefeuilles',
    steps: [
      "Recharges (Retraits, en haut) : un vendeur a demandé une recharge avec une référence RCH-…. Vérifie sur le relevé que le montant est arrivé avec cette référence, puis « Argent reçu — créditer ». Sinon, « Refuser ».",
      "Retraits : « Approuver » débite le portefeuille du vendeur (refusé si le solde est insuffisant). Envoie l'argent, puis « Marquer payé ».",
      "« Rejeter » un retrait avec un motif si les informations sont incorrectes.",
    ],
  },
  {
    id: 'agents',
    who: 'admin',
    title: "Nommer un agent de paiement",
    steps: [
      "La personne crée d'abord un compte normal sur le site.",
      "Ouvre Utilisateurs, trouve-la, puis clique sur « Nommer agent ».",
      "Elle accède alors à wennashop.com/admin/paiements et uniquement à cette page.",
      "Pour retirer l'accès : même bouton, « Retirer ».",
    ],
  },
  {
    id: 'pays',
    who: 'admin',
    title: 'Moyens de paiement et comptes de réception',
    steps: [
      "Ouvre Pays. Active ou désactive chaque moyen de paiement par pays.",
      "Fournisseur du mobile money : « Vérification manuelle (agent) » pour le circuit vérifié par l'équipe.",
      "Comptes de réception : pour chaque moyen, renseigne le numéro (ou le RIB), le titulaire et les instructions affichées au client, puis « Enregistrer ».",
    ],
    note: "Un moyen sans numéro ou RIB de réception n'est pas proposé au client.",
  },
  {
    id: 'support',
    who: 'admin',
    title: 'Réclamations et avis',
    steps: [
      "Réclamations : lis le message, contacte le client par e-mail, puis « Marquer traitée ». « Rouvrir » si le problème revient.",
      "Avis : approuve les avis honnêtes, même négatifs. Rejette les insultes, les données personnelles et les publicités.",
    ],
  },
  {
    id: 'parametres',
    who: 'admin',
    title: 'Paramètres et taux de change',
    steps: [
      "Mode maintenance : ferme tout le site avec un écran « Site en maintenance ». L'admin reste accessible pour le rouvrir.",
      "Fonctionnalités : quêtes, portefeuilles, boosts, fond blanc obligatoire, vérification d'identité automatique.",
      "Taux de change : mis à jour chaque matin. Une variation de plus de 5 % en un jour est bloquée et signalée : contrôle-la, puis « Appliquer ces taux ».",
      "Marge de sécurité : ajoutée à chaque conversion pour couvrir les frais de change.",
    ],
  },
];
