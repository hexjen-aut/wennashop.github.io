# Paiement manuel vérifié par un agent

Airtel Money (Gabon), Moov Money (Gabon) et virement bancaire (Maroc).

Le client paie hors du site, puis déclare son paiement avec l'ID de transaction.
Un agent vérifie sur le relevé opérateur ou bancaire, puis valide ou refuse.

Plus tard, l'API Airtel ou SingPay remplacera l'agent. Seule l'étape de vérification
changera : le callback fera la même transition que `review_payment('validate')`, et tout
le reste du circuit reste identique.

## Circuit

| Étape | Qui | Fonction | `payments.verification_status` | `payments.status` | `orders.status` |
|---|---|---|---|---|---|
| Choix du moyen au paiement | client | `submit_checkout` puis `create_manual_payment` | `awaiting_payment` | pending | pending |
| « J'ai payé » | client | `declare_payment` | `declared` | pending | pending |
| Validation | agent ou admin | `review_payment(validate)` | `validated` | paid | processing |
| Refus | agent ou admin | `review_payment(reject)` | `awaiting_payment` + motif, +12 h | pending | pending |
| Mise en attente | agent ou admin | `review_payment(hold)` | `declared` (`on_hold`) | pending | pending |
| Délai dépassé (24 h) | tâche toutes les 15 min | `expire_manual_payments` | `expired` | failed | cancelled |

Règles appliquées par la base :

- **Montant** recalculé côté serveur à partir des prix des produits et de la conversion
  avec marge. Il ne vient jamais du navigateur. Les montants en FCFA sont des entiers.
- **ID de transaction** unique par moyen de paiement.
- **Agent** : il ne peut pas valider son propre paiement.
- **Validation** : refusée si le montant reçu est inférieur au montant attendu.
- **Notifications** :
  - le vendeur est prévenu quand la commande passe en préparation (paiement validé ou
    paiement à la livraison), plus à la création de la commande ;
  - le client reçoit une notification (et un e-mail via `send-notification-email`) à
    chaque étape : instructions, déclaration reçue, refus avec motif, validation, annulation.
- **Reversement** : une commande livrée **et** payée crée une ligne dans `settlements`
  (brut − commission = net). Le paiement à la livraison n'en crée pas, car c'est le
  vendeur qui encaisse.

## Pages

- `/paiement` : les moyens réglés en « Vérification manuelle » apparaissent en cartes à part.
  Un moyen sans numéro ou RIB de réception n'est pas proposé.
- `/commande/[id]` :
  - instructions : montant exact, numéro ou RIB, titulaire et référence, chacun avec un bouton « Copier » ;
  - compte à rebours ;
  - formulaire « J'ai payé » (capture facultative, bucket privé `payment-proofs`) ;
  - statut mis à jour en direct ;
  - en cas de refus, le motif s'affiche et le client peut redéclarer.
- `/admin/paiements` (admins et agents) :
  - onglets À vérifier (alerte au-delà de 2 h), En attente client, Validés, Refusés ;
  - fiche détaillée avec historique des revues ;
  - actions Valider, Refuser et Mettre en attente ;
  - clôture du jour.
- `/admin/reversements` (admins) : reversements à faire, puis « Marquer comme payé »
  avec l'ID de la transaction de reversement.

## Mise en route

1. **Admin → Pays → Comptes de réception** : renseigne le numéro Airtel et le numéro
   Moov WennaShop (Gabon), avec le titulaire. Le RIB Maroc est repris de l'ancien réglage.
2. **Admin → Pays → Fournisseur du mobile money** : passe Airtel Money et Moov Money en
   « Vérification manuelle (agent) ». Le virement passe déjà par ce circuit.
3. **Admin → Utilisateurs** : bouton « Nommer agent » pour chaque membre de l'équipe
   qui vérifie les paiements.
4. **Telegram de l'équipe** :
   1. Importe `docs/n8n-paiement-declare-telegram.json` dans n8n.
   2. Crée les identifiants :
      - « WennaShop paiements » : Header Auth, nom `X-Webhook-Key`, valeur = une clé longue ;
      - « Bot WennaShop » : jeton du bot Telegram.
   3. Remplace `REMPLACER_PAR_ID_DU_GROUPE_TEAM_WENNA` par l'ID du groupe Team-wenna.
   4. Active le workflow.
   5. Dans Supabase → Edge Functions → Secrets, ajoute :
      - `N8N_PAYMENT_WEBHOOK_URL` = `https://wennashop.app.n8n.cloud/webhook/paiement-declare` ;
      - `N8N_PAYMENT_WEBHOOK_KEY` = la même clé.

Sans `N8N_PAYMENT_WEBHOOK_URL`, rien n'est bloqué : la déclaration est enregistrée et
l'absence de message est notée dans `system_logs` (source `payments`).

## Checklist de test

| # | Scénario | Attendu |
|---|---|---|
| 1 | Paiement OK : commande Gabon, Airtel Money manuel, envoi du montant exact, déclaration avec l'ID du SMS | L'équipe reçoit le message Telegram ; l'agent valide avec le montant reçu ; la page client passe à « Paiement validé » sans recharger ; la commande passe en préparation ; le vendeur reçoit « Nouvelle commande à préparer » |
| 2 | Montant faux : l'agent saisit un montant reçu inférieur | Validation refusée (« Montant reçu inférieur… ») ; l'agent refuse avec « Montant incorrect » ; le client voit le motif et dispose de 12 h de plus |
| 3 | ID en double : un second client déclare un ID déjà utilisé | « Cet ID de transaction a déjà été utilisé pour un autre paiement. » |
| 4 | Expiration : aucun paiement déclaré en 24 h | Au passage suivant de la tâche (15 min max), paiement expiré, commande annulée, client prévenu |
| 5 | Redéclaration : après un refus, le client corrige l'ID et redéclare | Le paiement repasse dans « À vérifier » ; l'historique montre le refus puis la nouvelle revue |
| 6 | Paiement à la livraison | Inchangé : commande directement en préparation, vendeur prévenu |
| 7 | Vendeur | Ne peut ni passer une commande non payée en préparation, ni modifier un montant |
| 8 | Livraison d'une commande payée | Ligne dans `/admin/reversements` (brut, commission, net), puis « Marquer comme payé » avec l'ID de reversement |

Les scénarios 1 à 8 ont été rejoués dans une transaction annulée sur les données de
production (32 vérifications) et sur les pages avec Playwright (30 vérifications).
