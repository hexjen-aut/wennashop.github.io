-- ═══════════════════════════════════════════════════════════
-- 1. Colonne tracking_number sur orders
-- ═══════════════════════════════════════════════════════════
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS tracking_number TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS delivery_address JSONB;

-- Index pour recherche rapide par tracking number
CREATE INDEX IF NOT EXISTS idx_orders_tracking_number 
  ON orders(tracking_number);

-- Génération automatique du tracking_number pour les commandes existantes
UPDATE orders
SET tracking_number = 'WNS-' || TO_CHAR(created_at, 'YYYYMMDD') || '-' || UPPER(SUBSTRING(id::text, 1, 4))
WHERE tracking_number IS NULL;

-- Trigger pour auto-générer le tracking_number sur les nouvelles commandes
CREATE OR REPLACE FUNCTION generate_tracking_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tracking_number IS NULL THEN
    NEW.tracking_number := 'WNS-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(NEW.id::text, 1, 4));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_tracking ON orders;
CREATE TRIGGER trg_generate_tracking
  BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION generate_tracking_number();


-- ═══════════════════════════════════════════════════════════
-- 2. Table deliveries
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS deliveries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  driver_id           UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Statut de livraison
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','assigned','picked_up','in_transit','out_for_delivery','delivered','failed','returned','cancelled')),

  -- Horodatages des étapes clés
  assigned_at         TIMESTAMPTZ,
  picked_up_at        TIMESTAMPTZ,
  in_transit_at       TIMESTAMPTZ,
  out_for_delivery_at TIMESTAMPTZ,
  delivered_at        TIMESTAMPTZ,
  failed_at           TIMESTAMPTZ,
  returned_at         TIMESTAMPTZ,

  -- Estimation & info
  estimated_delivery  DATE,
  actual_delivery     TIMESTAMPTZ,

  -- Localisation (optionnel, pour tracking live)
  last_lat            NUMERIC(10,7),
  last_lng            NUMERIC(10,7),
  last_location_name  TEXT,
  last_location_at    TIMESTAMPTZ,

  -- Notes & preuve de livraison
  notes               TEXT,
  proof_photo_url     TEXT,   -- photo à la livraison
  signature_url       TEXT,   -- signature client
  failure_reason      TEXT,   -- si échec

  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_deliveries_order_id  ON deliveries(order_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_driver_id ON deliveries(driver_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status    ON deliveries(status);


-- ═══════════════════════════════════════════════════════════
-- 3. Table delivery_events (historique granulaire des étapes)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS delivery_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id  UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL,  -- 'picked_up', 'checkpoint', 'attempted', 'delivered', etc.
  description  TEXT,
  location     TEXT,
  lat          NUMERIC(10,7),
  lng          NUMERIC(10,7),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_events_delivery_id ON delivery_events(delivery_id);


-- ═══════════════════════════════════════════════════════════
-- 4. Trigger updated_at sur deliveries
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_deliveries_updated_at ON deliveries;
CREATE TRIGGER trg_deliveries_updated_at
  BEFORE UPDATE ON deliveries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ═══════════════════════════════════════════════════════════
-- 5. Sync automatique : quand delivery.status change → orders.status se met à jour
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION sync_order_status_from_delivery()
RETURNS TRIGGER AS $$
DECLARE
  mapped_status TEXT;
BEGIN
  -- Mapping delivery status → order status
  mapped_status := CASE NEW.status
    WHEN 'picked_up'        THEN 'picked_up'
    WHEN 'in_transit'       THEN 'in_transit'
    WHEN 'out_for_delivery' THEN 'out_for_delivery'
    WHEN 'delivered'        THEN 'delivered'
    WHEN 'failed'           THEN 'pending'
    WHEN 'returned'         THEN 'returned'
    WHEN 'cancelled'        THEN 'cancelled'
    ELSE NULL
  END;

  IF mapped_status IS NOT NULL THEN
    UPDATE orders
    SET status = mapped_status,
        updated_at = NOW()
    WHERE id = NEW.order_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_order_status ON deliveries;
CREATE TRIGGER trg_sync_order_status
  AFTER INSERT OR UPDATE OF status ON deliveries
  FOR EACH ROW EXECUTE FUNCTION sync_order_status_from_delivery();


-- ═══════════════════════════════════════════════════════════
-- 6. RLS — Row Level Security
-- ═══════════════════════════════════════════════════════════
ALTER TABLE deliveries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_events  ENABLE ROW LEVEL SECURITY;

-- deliveries : lecture publique (acheteur peut voir sa livraison)
CREATE POLICY "deliveries_select_public"
  ON deliveries FOR SELECT
  USING (true);

-- deliveries : insert/update par le livreur assigné ou admin
CREATE POLICY "deliveries_insert_driver_or_admin"
  ON deliveries FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT auth_id FROM users WHERE role IN ('admin','artisan','driver')
    )
  );

CREATE POLICY "deliveries_update_driver_or_admin"
  ON deliveries FOR UPDATE
  USING (
    driver_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
    OR auth.uid() IN (SELECT auth_id FROM users WHERE role = 'admin')
  );

-- delivery_events : lecture publique
CREATE POLICY "delivery_events_select_public"
  ON delivery_events FOR SELECT
  USING (true);

-- delivery_events : insert par livreur ou admin
CREATE POLICY "delivery_events_insert_driver_or_admin"
  ON delivery_events FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT auth_id FROM users WHERE role IN ('admin','driver','artisan')
    )
  );
