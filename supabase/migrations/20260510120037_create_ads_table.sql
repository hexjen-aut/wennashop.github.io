-- Table publicités WennaShop
CREATE TABLE IF NOT EXISTS ads (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title       text NOT NULL,
  description text,
  image_url   text,
  cta_label   text DEFAULT 'Découvrir',
  cta_url     text DEFAULT '#',
  is_active   boolean DEFAULT true,
  sort_order  integer DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ads_is_active_sort ON ads (is_active, sort_order);

ALTER TABLE ads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ads_select_public" ON ads
  FOR SELECT USING (is_active = true);

CREATE POLICY "ads_all_admin" ON ads
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_id = auth.uid()
        AND users.role = 'admin'
    )
  );

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ads_updated_at
  BEFORE UPDATE ON ads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
