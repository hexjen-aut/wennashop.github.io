ALTER TABLE products ADD COLUMN IF NOT EXISTS brand text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS material text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight numeric;
ALTER TABLE products ADD COLUMN IF NOT EXISTS dimensions text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS warranty text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS delivery_days integer;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS compare_price numeric;
ALTER TABLE products ADD COLUMN IF NOT EXISTS tags text[];

CREATE TABLE IF NOT EXISTS product_images (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  url text NOT NULL,
  position integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
