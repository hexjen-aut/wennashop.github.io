# Airtel Money Gabon en direct

Encaissement Airtel Money (push USSD) via l'API Airtel Africa, sans
intermédiaire. C'est un des trois fournisseurs possibles du moyen « Airtel
Money », avec SingPay et pawaPay : le choix se fait dans **Admin → Pays →
Fournisseur du mobile money** (« Airtel direct »). Les autres moyens de
paiement ne changent pas.

## Parcours acheteur

1. Au paiement, pays de livraison **Gabon**, « Mobile Money » puis
   « Airtel Money ». Le numéro se saisit après un préfixe **+241** fixe.
2. « Vérifier mon numéro Airtel » → `airtel-kyc` : affiche « Paiement au nom
   de J*** D*** » (ou « Ce numéro n'est pas un compte Airtel Money »).
3. « Confirmer le paiement de X FCFA » → `airtel-collect` : l'acheteur reçoit
   la demande sur son téléphone et saisit son code PIN.
4. Écran d'attente, mis à jour en direct (Realtime sur `payments`, relecture
   toutes les 10 s) ; bouton « Vérifier le statut » après 30 s.
5. Payé → « Commande confirmée ». Échec → message clair (solde insuffisant,
   PIN incorrect, délai dépassé, refus) et bouton « Réessayer ».

La commande n'est **jamais** validée sur la réponse immédiate d'Airtel :
seulement quand `airtel-callback` ou `airtel-status` a relu le statut `TS`
chez Airtel. Elle passe alors de `pending` à `processing`, comme avec les
autres fournisseurs (notifications vendeur et commissions inchangées).

## Fonctions (supabase/functions)

| Fonction | Accès | Rôle |
|---|---|---|
| `_shared/airtel.ts` | — | jeton OAuth en cache (`airtel_tokens`), appels Airtel, signature des messages (option), journaux `system_logs` sans secret |
| `airtel-kyc` | utilisateur connecté | nom masqué du titulaire + compte bloqué |
| `airtel-collect` | utilisateur connecté | montant relu en base, référence unique `WN…`, push USSD |
| `airtel-callback` | public (`verify_jwt = false`) | callback Airtel, idempotent, statut relu chez Airtel |
| `airtel-status` | utilisateur connecté, ou pg_cron | vérification manuelle ; toutes les 2 min, relance des paiements en attente et clôture à 15 min |

## Secrets (Supabase → Edge Functions → Secrets)

| Secret | Valeur |
|---|---|
| `AIRTEL_BASE_URL` | UAT : `https://openapiuat.airtel.africa` · prod : `https://openapi.airtel.africa` |
| `AIRTEL_CLIENT_ID` / `AIRTEL_CLIENT_SECRET` | clés de l'application (portail) |
| `AIRTEL_COUNTRY` / `AIRTEL_CURRENCY` | `GA` / `XAF` (valeurs par défaut) |
| `AIRTEL_COLLECT_PATH` | défaut `/merchant/v2/payments/` — à adapter à la version activée (v1 / v2 / v3) |
| `AIRTEL_ENQUIRY_PATH` | défaut `/standard/v1/payments/` |
| `AIRTEL_KYC_PATH` | défaut `/standard/v1/users/` |
| `AIRTEL_MESSAGE_SIGNING` | `true` si la signature des messages est exigée par le compte (sinon ne pas définir) |
| `AIRTEL_RSA_PUBLIC_KEY` | clé publique Airtel (signature des messages, PIN de décaissement) |
| `AIRTEL_CALLBACK_HASH_KEY` | clé de l'« Authentification du rappel », si activée |
| `AIRTEL_MSISDN_KEEP_ZERO` | `true` si l'API attend le numéro avec le 0 (`077…`) ; par défaut `77…` |
| `AIRTEL_RELAY_URL` | URL du webhook n8n du relais (voir « Relais n8n ») |
| `AIRTEL_RELAY_KEY` | clé partagée avec la credential n8n « Airtel relay key » |
| `AIRTEL_DISBURSE_PIN` | phase 2 (décaissements), inutilisé pour l'instant |

## Réglages du portail Airtel

- **Sécurité → Ajouter une URL de rappel** : « APIs de collecte » /
  « Transaction » → `https://aakxoydznmybstfozjte.supabase.co/functions/v1/airtel-callback`
- **Authentification du rappel** : à activer après un premier paiement UAT
  réussi (on vérifie d'abord le format exact du callback reçu, stocké dans
  `payments.raw_callback`), puis copier la clé dans `AIRTEL_CALLBACK_HASH_KEY`.
  Même sans, aucun paiement n'est validé sans relecture du statut chez Airtel.
- **Liste des IP de serveur autorisées** : la liste ne peut pas être vidée,
  et les fonctions Supabase n'ont pas d'adresse IP fixe. Les appels vers
  Airtel passent donc par un **relais n8n** (voir plus bas) dont l'IP est
  déclarée ici.
- **Configuration → statuts supplémentaires (APIs de collecte)** : à activer.
  Airtel renvoie alors `TE` (transaction expirée) quand l'acheteur ne répond
  pas au push USSD ; le site l'affiche comme « Délai dépassé ».
- **Configuration → Définir le code PIN (APIs de transfert)** : phase 2.

## Relais n8n (IP fixe)

Airtel n'accepte que les IP déclarées dans le portail. Les fonctions envoient
donc chaque appel (jeton, KYC, encaissement, statut) à un webhook n8n qui le
transmet à Airtel depuis son IP. Les callbacks Airtel → Supabase ne passent
pas par le relais.

1. **Hébergement de n8n** : un serveur allumé en permanence, avec une **IP
   fixe** et une adresse HTTPS publique (VPS avec n8n, ou n8n Cloud). Un
   ordinateur personnel ne convient pas (IP qui change, machine éteinte).
2. **Clé du relais** : générer une longue clé aléatoire (40 caractères ou plus).
   - n8n → Credentials → « Header Auth », nom `Airtel relay key`,
     Name `X-Relay-Key`, Value = la clé.
   - Supabase → Secrets : `AIRTEL_RELAY_KEY` = la même clé.
3. **Importer** `docs/n8n-airtel-relay.json` (Workflows → Import from file),
   rattacher la credential au nœud « Requête Supabase », puis **activer** le
   workflow. Les exécutions ne sont pas enregistrées (elles contiendraient les
   jetons Airtel).
4. **URL** : copier l'URL de production du webhook
   (`https://<n8n>/webhook/airtel-relay`) dans le secret `AIRTEL_RELAY_URL`.
5. **IP à déclarer chez Airtel** : dans n8n, un workflow d'essai avec un nœud
   HTTP Request vers `https://api.ipify.org?format=json` donne l'IP de sortie.
   La déclarer dans « Liste des IP de serveur autorisées » (avec n8n Cloud,
   déclarer toutes les IP de sortie publiées par n8n).

Le relais n'accepte que les hôtes `openapi.airtel.africa` et
`openapiuat.airtel.africa` ; sans la bonne clé, n8n répond 403.

## Tests en UAT

Les numéros de test et leurs comportements (succès, solde insuffisant, PIN
incorrect, expiration) sont fournis dans la documentation du portail Airtel
(section Collection / Sandbox) ; les noter ici une fois connus :

| Numéro de test | Résultat attendu | Vérifié |
|---|---|---|
| `…` | succès (TS) | ☐ |
| `…` | échec (TF) | ☐ |
| `…` | sans réponse → TE / 15 min | ☐ |

Pour chaque essai : `payments` (`status`, `status_code`, `airtel_money_id`,
`raw_callback`), `orders.status` (`processing` si payé), `system_logs`
(`source = 'airtel'`).

Vérifications rapides depuis le SQL Editor :

```sql
select status, status_code, provider_message, reference, updated_at
from payments where provider = 'airtel' order by updated_at desc limit 10;

select created_at, level, message, status_code
from system_logs where source = 'airtel' order by created_at desc limit 20;
```

## Passage en production

- [ ] Tests UAT concluants (succès, échec, expiration, callback reçu)
- [ ] `AIRTEL_BASE_URL` = `https://openapi.airtel.africa`
- [ ] `AIRTEL_CLIENT_ID` / `AIRTEL_CLIENT_SECRET` de production
- [ ] URL de callback déclarée sur l'application de production
- [ ] Authentification du rappel activée + `AIRTEL_CALLBACK_HASH_KEY`
- [ ] Signature des messages : `AIRTEL_MESSAGE_SIGNING` / `AIRTEL_RSA_PUBLIC_KEY` si exigée
- [ ] Relais n8n actif, son IP déclarée dans le portail de production
- [ ] Admin → Pays : Airtel Money sur « Airtel direct »
- [ ] Un vrai paiement de faible montant, puis vérification de la commande

## Phase 2 : décaissements (non activé)

La table `payouts` a reçu les colonnes `provider`, `reference`,
`provider_txn_id`, `status_code`, `provider_message`, `kyc_name`,
`raw_response`. `_shared/airtel.ts` contient déjà `encryptPin` (PIN chiffré en
RSA) ; la fonction `airtel-disburse`, réservée à l'admin, viendra ensuite avec
vérification KYC du numéro vendeur avant envoi.
