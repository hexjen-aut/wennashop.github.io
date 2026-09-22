-- Table principale des quêtes
CREATE TABLE IF NOT EXISTS quests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  buyer_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  title           TEXT NOT NULL,
  description     TEXT,
  category_id     UUID REFERENCES categories(id),
  country_target  TEXT CHECK (country_target IN ('Gabon','Maroc','Les deux')),

  product_budget  NUMERIC(12,2) NOT NULL,
  reward_amount   NUMERIC(12,2) NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'FCFA',

  escrow_locked   BOOLEAN NOT NULL DEFAULT false,
  escrow_ref      TEXT,

  duration_days   INT NOT NULL DEFAULT 7 CHECK (duration_days IN (3,7,14)),
  expires_at      TIMESTAMPTZ,

  status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','under_review','resolved','expired','cancelled')),

  winning_proposal_id UUID,
  resolved_at     TIMESTAMPTZ,
  reference_image TEXT,
  platform_fee    NUMERIC(12,2) DEFAULT 0
);

-- Table des propositions
CREATE TABLE IF NOT EXISTS quest_proposals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  quest_id        UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
  hunter_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  proposed_price  NUMERIC(12,2) NOT NULL,
  description     TEXT NOT NULL,
  product_url     TEXT,
  product_images  TEXT[],
  delivery_days   INT,

  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','selected','rejected','expired')),

  UNIQUE (quest_id, hunter_id)
);

-- FK circulaire
ALTER TABLE quests
  ADD CONSTRAINT fk_winning_proposal
  FOREIGN KEY (winning_proposal_id)
  REFERENCES quest_proposals(id)
  ON DELETE SET NULL;

-- Table des litiges
CREATE TABLE IF NOT EXISTS quest_disputes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  quest_id        UUID NOT NULL REFERENCES quests(id),
  raised_by       UUID NOT NULL REFERENCES auth.users(id),
  reason          TEXT NOT NULL,
  evidence_urls   TEXT[],
  status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','resolved_buyer','resolved_hunter','cancelled')),
  resolved_at     TIMESTAMPTZ,
  admin_notes     TEXT
);

-- RLS
ALTER TABLE quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE quest_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE quest_disputes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quests_select_open" ON quests FOR SELECT
  USING (status = 'open' OR buyer_id = auth.uid());

CREATE POLICY "quests_insert_buyer" ON quests FOR INSERT
  WITH CHECK (auth.uid() = buyer_id);

CREATE POLICY "quests_update_buyer" ON quests FOR UPDATE
  USING (auth.uid() = buyer_id);

CREATE POLICY "proposals_select" ON quest_proposals FOR SELECT
  USING (
    auth.uid() = hunter_id
    OR auth.uid() = (SELECT buyer_id FROM quests WHERE id = quest_id)
  );

CREATE POLICY "proposals_insert" ON quest_proposals FOR INSERT
  WITH CHECK (auth.uid() = hunter_id);

CREATE POLICY "proposals_update_hunter" ON quest_proposals FOR UPDATE
  USING (auth.uid() = hunter_id AND status = 'pending');

CREATE POLICY "disputes_insert" ON quest_disputes FOR INSERT
  WITH CHECK (auth.uid() = raised_by);

CREATE POLICY "disputes_select" ON quest_disputes FOR SELECT
  USING (
    auth.uid() = raised_by
    OR auth.uid() = (SELECT buyer_id FROM quests WHERE id = quest_id)
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_quests_status ON quests(status);
CREATE INDEX IF NOT EXISTS idx_quests_buyer ON quests(buyer_id);
CREATE INDEX IF NOT EXISTS idx_quests_expires ON quests(expires_at);
CREATE INDEX IF NOT EXISTS idx_proposals_quest ON quest_proposals(quest_id);
CREATE INDEX IF NOT EXISTS idx_proposals_hunter ON quest_proposals(hunter_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER quests_updated_at
  BEFORE UPDATE ON quests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Trigger expires_at auto-calculé à l'INSERT
CREATE OR REPLACE FUNCTION set_quest_expires_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.expires_at := NEW.created_at + (NEW.duration_days || ' days')::INTERVAL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER quests_set_expires
  BEFORE INSERT ON quests
  FOR EACH ROW EXECUTE FUNCTION set_quest_expires_at();

-- Fonction expire_quests (à appeler via cron)
CREATE OR REPLACE FUNCTION expire_quests()
RETURNS void AS $$
BEGIN
  UPDATE quests SET status = 'expired'
  WHERE status = 'open' AND expires_at < now();
END;
$$ LANGUAGE plpgsql;
