-- ── TABLE BOOST PACKS (catalogue des offres) ──
CREATE TABLE IF NOT EXISTS public.boost_packs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  slug         text NOT NULL UNIQUE,
  description  text,
  duration_days integer NOT NULL,
  price_fcfa   numeric NOT NULL,
  price_mad    numeric NOT NULL,
  features     text[] DEFAULT '{}',
  is_active    boolean DEFAULT true,
  sort_order   integer DEFAULT 0,
  created_at   timestamptz DEFAULT now()
);

-- Seed des 3 packs
INSERT INTO public.boost_packs (name, slug, description, duration_days, price_fcfa, price_mad, features, sort_order) VALUES
(
  'Starter', 'starter',
  'Idéal pour tester la visibilité',
  7, 2500, 50,
  ARRAY['Produit en vedette dans le catalogue', 'Badge "En vedette" sur la fiche produit', 'Priorité dans les résultats de recherche'],
  1
),
(
  'Pro', 'pro',
  'Plus de visibilité, plus de ventes',
  14, 5000, 95,
  ARRAY['Produit en vedette dans le catalogue', 'Badge "Top Vendeur" sur la boutique', 'Priorité dans les résultats de recherche', 'Mise en avant dans la catégorie'],
  2
),
(
  'Premium', 'premium',
  'Visibilité maximale sur toute la plateforme',
  30, 10000, 190,
  ARRAY['Boutique mise en avant sur la homepage', 'Produit en vedette dans le catalogue', 'Badge "Top Vendeur" sur la boutique', 'Boost quête remonté en tête de liste', 'Priorité absolue dans les recherches'],
  3
);

-- ── TABLE BOOSTS ACTIFS ──
CREATE TABLE IF NOT EXISTS public.boosts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  shop_id         uuid REFERENCES public.shops(id) ON DELETE SET NULL,
  product_id      uuid REFERENCES public.products(id) ON DELETE SET NULL,
  pack_id         uuid NOT NULL REFERENCES public.boost_packs(id),
  type            text NOT NULL CHECK (type = ANY (ARRAY[
                    'product_featured','shop_homepage','badge_top_seller','quest_boost'
                  ])),
  status          text DEFAULT 'active' CHECK (status = ANY (ARRAY['active','expired','cancelled'])),
  started_at      timestamptz DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  wallet_tx_id    uuid,
  amount_paid     numeric NOT NULL,
  currency        text DEFAULT 'FCFA',
  created_at      timestamptz DEFAULT now()
);

-- Index pour les requêtes de visibilité (très fréquentes)
CREATE INDEX IF NOT EXISTS boosts_active_idx ON public.boosts(status, expires_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS boosts_product_idx ON public.boosts(product_id, status, expires_at);
CREATE INDEX IF NOT EXISTS boosts_shop_idx ON public.boosts(shop_id, status, expires_at);
CREATE INDEX IF NOT EXISTS boosts_user_idx ON public.boosts(user_id);

-- ── RLS BOOSTS ──
ALTER TABLE public.boosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boost_packs ENABLE ROW LEVEL SECURITY;

-- Packs : lecture publique
CREATE POLICY "boost_packs_public_read" ON public.boost_packs FOR SELECT USING (is_active = true);

-- Boosts actifs : lecture publique (pour afficher les badges)
CREATE POLICY "boosts_public_read" ON public.boosts FOR SELECT USING (status = 'active' AND expires_at > now());

-- Vendeur voit ses propres boosts (tous statuts)
CREATE POLICY "boosts_owner_read" ON public.boosts FOR SELECT
  USING (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- Vendeur crée un boost (via wallet)
CREATE POLICY "boosts_owner_insert" ON public.boosts FOR INSERT
  WITH CHECK (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- Admin tout accès
CREATE POLICY "boosts_admin_all" ON public.boosts FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE auth_id = auth.uid() AND role = 'admin'));

CREATE POLICY "boost_packs_admin_all" ON public.boost_packs FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE auth_id = auth.uid() AND role = 'admin'));

-- ── FONCTION : acheter un boost via wallet ──
CREATE OR REPLACE FUNCTION public.purchase_boost(
  p_user_id     uuid,
  p_pack_id     uuid,
  p_product_id  uuid DEFAULT NULL,
  p_shop_id     uuid DEFAULT NULL,
  p_currency    text DEFAULT 'FCFA'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pack        boost_packs%ROWTYPE;
  v_wallet      vendor_wallets%ROWTYPE;
  v_price       numeric;
  v_tx_id       uuid;
  v_boost_id    uuid;
  v_expires_at  timestamptz;
BEGIN
  -- Charger le pack
  SELECT * INTO v_pack FROM boost_packs WHERE id = p_pack_id AND is_active = true;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Pack introuvable'); END IF;

  -- Prix selon devise
  v_price := CASE WHEN p_currency = 'MAD' THEN v_pack.price_mad ELSE v_pack.price_fcfa END;

  -- Charger le wallet
  SELECT * INTO v_wallet FROM vendor_wallets WHERE user_id = p_user_id;
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
$$;
