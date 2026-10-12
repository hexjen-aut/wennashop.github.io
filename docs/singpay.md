# SingPay (Airtel Money / Moov Money Gabon)

Le site (Vercel) ne parle jamais à SingPay. Tout passe par deux Edge Functions
Supabase, qui lisent les identifiants dans les secrets Supabase. Aucun ID de
portefeuille n'est écrit dans le code.

| Fonction | Rôle | Utilise |
|---|---|---|
| `process-payment` | Lance le paiement (push USSD 74 = Airtel, 62 = Moov, ou lien `/ext`) | `x-client-id`, `x-client-secret`, `x-wallet` + champ `portefeuille` |
| `singpay-webhook` | Callback SingPay : relit la transaction chez SingPay (`search/by-reference`, en-tête `x-wallet`) avant de valider | `x-wallet` + contrôle que la transaction est sur ce portefeuille |

## Secrets Supabase (Edge Functions → Secrets)

| Secret | Valeur |
|---|---|
| `SINGPAY_CLIENT_ID` | Client ID du compte SingPay |
| `SINGPAY_SECRET` | Client secret du compte SingPay |
| `SINGPAY_WALLET_ID` | ID du portefeuille qui encaisse |

Si l'un des trois manque, `process-payment` répond 503 (« pas encore
disponible ») et le webhook ne valide aucun paiement.

Rien à déclarer sur Vercel. Si des variables `SINGPAY_*` y traînent, les supprimer.

## Callback (portail SingPay, sur le portefeuille)

`https://aakxoydznmybstfozjte.supabase.co/functions/v1/singpay-webhook`

## Changer de portefeuille

1. Dans le portail SingPay, déclarer l'URL de callback ci-dessus sur le nouveau portefeuille.
2. Vérifier que `SINGPAY_CLIENT_ID` / `SINGPAY_SECRET` sont ceux du compte qui possède ce portefeuille.
3. Remplacer `SINGPAY_WALLET_ID` dans les secrets Supabase. Pas de redéploiement nécessaire.
4. Admin → Pays : moyen Airtel Money / Moov Money sur « SingPay ».
5. Faire un paiement test de 100 FCFA. Les paiements lancés sur l'ancien portefeuille et encore en attente ne seront plus validés par le webhook : les relancer.

## Diagnostic

- Refus de SingPay au lancement : table `system_logs`, `source = 'singpay'` (code HTTP et réponse de SingPay).
- Callback reçu : `payments.metadata.last_callback` et `payments.metadata.singpay_verified` (statut relu, montant, contrôles `reference` / `wallet` / `amount`).
