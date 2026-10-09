-- purchase_boost débitait le portefeuille de n'importe quel p_user_id, sans
-- vérifier qui appelle (SECURITY DEFINER, exécutable en anonyme). Désormais
-- seul le propriétaire du portefeuille, ou le serveur (service_role), peut
-- acheter un boost, et uniquement pour sa propre boutique et ses produits.
create or replace function public.purchase_boost(
  p_user_id uuid,
  p_pack_id uuid,
  p_product_id uuid default null,
  p_shop_id uuid default null,
  p_currency text default 'FCFA'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
DECLARE
  v_pack        boost_packs%ROWTYPE;
  v_wallet      vendor_wallets%ROWTYPE;
  v_price       numeric;
  v_tx_id       uuid;
  v_boost_id    uuid;
  v_expires_at  timestamptz;
BEGIN
  -- Appelant : le propriétaire du portefeuille, ou le serveur
  IF coalesce(auth.role(), '') <> 'service_role'
     AND p_user_id IS DISTINCT FROM public.my_user_id() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Non autorisé');
  END IF;
  IF p_shop_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM shops WHERE id = p_shop_id AND user_id = p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Boutique introuvable');
  END IF;
  IF p_product_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id AND seller_id = p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Produit introuvable');
  END IF;

  -- Charger le pack
  SELECT * INTO v_pack FROM boost_packs WHERE id = p_pack_id AND is_active = true;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Pack introuvable'); END IF;

  -- Prix selon devise
  v_price := CASE WHEN p_currency = 'MAD' THEN v_pack.price_mad ELSE v_pack.price_fcfa END;

  -- Charger le wallet (verrouillé jusqu'au débit)
  SELECT * INTO v_wallet FROM vendor_wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Wallet introuvable'); END IF;

  -- Vérifier solde
  IF v_wallet.balance < v_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solde insuffisant', 'balance', v_wallet.balance, 'required', v_price);
  END IF;

  -- Déduire du wallet
  UPDATE vendor_wallets SET balance = balance - v_price, updated_at = now() WHERE user_id = p_user_id;

  -- Enregistrer la transaction
  INSERT INTO wallet_transactions (user_id, type, amount, currency, description, status)
  VALUES (p_user_id, 'debit', v_price, p_currency, 'Boost ' || v_pack.name, 'completed')
  RETURNING id INTO v_tx_id;

  -- Calculer expiration
  v_expires_at := now() + (v_pack.duration_days || ' days')::interval;

  -- Créer les boosts selon le pack
  -- Pack Starter : product_featured
  IF v_pack.slug IN ('starter', 'pro', 'premium') AND p_product_id IS NOT NULL THEN
    INSERT INTO boosts (user_id, shop_id, product_id, pack_id, type, expires_at, wallet_tx_id, amount_paid, currency)
    VALUES (p_user_id, p_shop_id, p_product_id, p_pack_id, 'product_featured', v_expires_at, v_tx_id, v_price, p_currency)
    RETURNING id INTO v_boost_id;
  END IF;

  -- Pack Pro + Premium : badge_top_seller
  IF v_pack.slug IN ('pro', 'premium') AND p_shop_id IS NOT NULL THEN
    INSERT INTO boosts (user_id, shop_id, product_id, pack_id, type, expires_at, wallet_tx_id, amount_paid, currency)
    VALUES (p_user_id, p_shop_id, p_product_id, p_pack_id, 'badge_top_seller', v_expires_at, v_tx_id, v_price, p_currency);
  END IF;

  -- Pack Premium : shop_homepage + quest_boost
  IF v_pack.slug = 'premium' AND p_shop_id IS NOT NULL THEN
    INSERT INTO boosts (user_id, shop_id, product_id, pack_id, type, expires_at, wallet_tx_id, amount_paid, currency)
    VALUES (p_user_id, p_shop_id, p_product_id, p_pack_id, 'shop_homepage', v_expires_at, v_tx_id, v_price, p_currency);

    INSERT INTO boosts (user_id, shop_id, product_id, pack_id, type, expires_at, wallet_tx_id, amount_paid, currency)
    VALUES (p_user_id, p_shop_id, p_product_id, p_pack_id, 'quest_boost', v_expires_at, v_tx_id, v_price, p_currency);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'boost_id', v_boost_id,
    'expires_at', v_expires_at,
    'amount_deducted', v_price,
    'new_balance', v_wallet.balance - v_price
  );
END;
$function$;

-- Un visiteur sans compte n'a aucune raison d'acheter un boost.
revoke execute on function public.purchase_boost(uuid, uuid, uuid, uuid, text) from public, anon;
grant execute on function public.purchase_boost(uuid, uuid, uuid, uuid, text) to authenticated, service_role;
