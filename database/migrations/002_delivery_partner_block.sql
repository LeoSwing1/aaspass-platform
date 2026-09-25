ALTER TABLE delivery_assignments
  ADD COLUMN IF NOT EXISTS earning_paise BIGINT NOT NULL DEFAULT 0 CHECK (earning_paise >= 0),
  ADD COLUMN IF NOT EXISTS bonus_paise BIGINT NOT NULL DEFAULT 0 CHECK (bonus_paise >= 0),
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_delivery_assignments_offered
  ON delivery_assignments(status, created_at)
  WHERE status = 'OFFERED';

CREATE INDEX IF NOT EXISTS idx_delivery_assignments_partner_status
  ON delivery_assignments(delivery_partner_id, status, updated_at DESC);

COMMENT ON COLUMN delivery_assignments.earning_paise IS 'Authoritative delivery partner earning allocation for this completed assignment.';
COMMENT ON COLUMN delivery_assignments.bonus_paise IS 'Separate incentive/bonus amount allocated to the delivery partner.';
