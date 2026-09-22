-- ══════════════════════════════════════════════════
-- 1. Colonnes manquantes sur quest_proposals
-- ══════════════════════════════════════════════════
ALTER TABLE quest_proposals
  ADD COLUMN IF NOT EXISTS selected_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reward_paid_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_type   TEXT CHECK (delivery_type IN ('local','international')),
  ADD COLUMN IF NOT EXISTS tracking_ref    TEXT,
  ADD COLUMN IF NOT EXISTS hunter_notified BOOLEAN DEFAULT FALSE;

-- Étendre les statuts possibles d'une proposition
ALTER TABLE quest_proposals
  DROP CONSTRAINT IF EXISTS quest_proposals_status_check;
ALTER TABLE quest_proposals
  ADD CONSTRAINT quest_proposals_status_check
  CHECK (status IN ('pending','selected','in_delivery','delivered','reward_paid','rejected','expired'));

-- ══════════════════════════════════════════════════
-- 2. Table notifications in-app
-- ══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,  -- 'proposal_accepted' | 'reward_paid' | 'quest_new_proposal' | etc.
  title       TEXT NOT NULL,
  body        TEXT,
  link        TEXT,           -- URL de redirection au clic
  is_read     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_select_own" ON notifications
  FOR SELECT USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY "notif_update_own" ON notifications
  FOR UPDATE USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY "notif_insert_system" ON notifications
  FOR INSERT WITH CHECK (true); -- insert via trigger server-side

-- ══════════════════════════════════════════════════
-- 3. Trigger : notifier le chasseur quand sa proposition est sélectionnée
-- ══════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION notify_hunter_on_selection()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_quest_title TEXT;
  v_quest_id    UUID;
BEGIN
  -- Déclenche seulement quand status passe à 'selected'
  IF NEW.status = 'selected' AND (OLD.status IS DISTINCT FROM 'selected') THEN
    SELECT title, id INTO v_quest_title, v_quest_id
    FROM quests WHERE id = NEW.quest_id;

    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (
      NEW.hunter_id,
      'proposal_accepted',
      '🎯 Proposition acceptée !',
      'Votre offre pour « ' || v_quest_title || ' » a été retenue. Procédez à la livraison via Wenna Express.',
      '/quete-detail.html?id=' || NEW.quest_id::TEXT
    );

    UPDATE quest_proposals SET selected_at = now(), hunter_notified = TRUE
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_hunter ON quest_proposals;
CREATE TRIGGER trg_notify_hunter
  AFTER UPDATE ON quest_proposals
  FOR EACH ROW EXECUTE FUNCTION notify_hunter_on_selection();

-- ══════════════════════════════════════════════════
-- 4. Trigger : notifier l'acheteur quand une nouvelle proposition arrive
-- ══════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION notify_buyer_on_proposal()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_quest_title TEXT;
  v_buyer_id    UUID;
BEGIN
  SELECT title, buyer_id INTO v_quest_title, v_buyer_id
  FROM quests WHERE id = NEW.quest_id;

  INSERT INTO notifications (user_id, type, title, body, link)
  VALUES (
    v_buyer_id,
    'quest_new_proposal',
    '📦 Nouvelle proposition reçue',
    'Un chasseur a proposé un produit pour votre quête « ' || v_quest_title || ' ».',
    '/quete-detail.html?id=' || NEW.quest_id::TEXT
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_buyer ON quest_proposals;
CREATE TRIGGER trg_notify_buyer
  AFTER INSERT ON quest_proposals
  FOR EACH ROW EXECUTE FUNCTION notify_buyer_on_proposal();

-- ══════════════════════════════════════════════════
-- 5. Trigger : notifier le chasseur quand la récompense est versée
-- ══════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION notify_hunter_reward_paid()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_quest_title  TEXT;
  v_reward       NUMERIC;
  v_currency     TEXT;
BEGIN
  IF NEW.status = 'reward_paid' AND (OLD.status IS DISTINCT FROM 'reward_paid') THEN
    SELECT q.title, q.reward_amount, q.currency
    INTO v_quest_title, v_reward, v_currency
    FROM quests q WHERE q.id = NEW.quest_id;

    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (
      NEW.hunter_id,
      'reward_paid',
      '💰 Récompense versée !',
      'Votre récompense de ' || v_reward || ' ' || v_currency || ' pour « ' || v_quest_title || ' » a été versée sur votre portefeuille.',
      '/compte.html'
    );

    UPDATE quest_proposals SET reward_paid_at = now() WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_reward ON quest_proposals;
CREATE TRIGGER trg_notify_reward
  AFTER UPDATE ON quest_proposals
  FOR EACH ROW EXECUTE FUNCTION notify_hunter_reward_paid();
