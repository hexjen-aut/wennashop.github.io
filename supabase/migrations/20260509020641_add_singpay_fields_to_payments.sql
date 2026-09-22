ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS singpay_token TEXT,
  ADD COLUMN IF NOT EXISTS singpay_ref TEXT,
  ADD COLUMN IF NOT EXISTS checkout_url TEXT;

-- Mettre à jour le default provider pour accepter 'singpay'
COMMENT ON COLUMN payments.provider IS 'cinetpay | singpay | stripe | manual';
