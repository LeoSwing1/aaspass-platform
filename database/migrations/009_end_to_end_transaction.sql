-- AasPass Block 11: end-to-end transaction integrity + fulfillment controls
ALTER TABLE orders ADD COLUMN IF NOT EXISTS vendor_accepted_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS preparing_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ready_for_pickup_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_assigned_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS pickup_otp_hash TEXT;
ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS drop_otp_hash TEXT;
ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS pickup_otp_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS drop_otp_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS last_location_at TIMESTAMPTZ;

ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);
CREATE UNIQUE INDEX IF NOT EXISTS ux_ledger_entries_idempotency_key ON ledger_entries(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_delivery_assignments_partner_status ON delivery_assignments(delivery_partner_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_fulfillment_status ON orders(status,updated_at DESC);

-- Operationally safe, non-financially-authoritative outbox entries can be retried.
CREATE INDEX IF NOT EXISTS idx_outbox_aggregate ON integration_outbox(aggregate_type,aggregate_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount_paise BIGINT NOT NULL CHECK(amount_paise>0),
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  provider VARCHAR(80),
  provider_ref VARCHAR(255),
  reason VARCHAR(255),
  created_by UUID REFERENCES users(id),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refunds_order_created ON refunds(order_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_refund_order_pending ON refunds(order_id) WHERE status IN ('PENDING','PROCESSING');

ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS pickup_otp_ciphertext TEXT;
ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS pickup_otp_iv TEXT;
ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS pickup_otp_tag TEXT;
ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS drop_otp_ciphertext TEXT;
ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS drop_otp_iv TEXT;
ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS drop_otp_tag TEXT;
CREATE INDEX IF NOT EXISTS idx_delivery_assignments_order_status ON delivery_assignments(order_id,status);
