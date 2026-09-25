-- AasPass Block 17: operational automation, SLA escalation, dispatch history, refunds and RBAC governance
ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS offer_expires_at TIMESTAMPTZ;
ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS reassignment_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS delivery_assignment_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES delivery_assignments(id) ON DELETE CASCADE,
  delivery_partner_id UUID NOT NULL REFERENCES delivery_partners(id) ON DELETE CASCADE,
  status VARCHAR(30) NOT NULL DEFAULT 'OFFERED',
  distance_km NUMERIC(10,3),
  offered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  reason VARCHAR(255)
);
CREATE INDEX IF NOT EXISTS idx_delivery_offer_partner_status ON delivery_assignment_offers(delivery_partner_id,status,offered_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_offer_assignment ON delivery_assignment_offers(assignment_id,offered_at DESC);

CREATE TABLE IF NOT EXISTS order_sla_policies (
  status VARCHAR(40) PRIMARY KEY,
  max_minutes INTEGER NOT NULL CHECK(max_minutes > 0),
  escalation_level VARCHAR(20) NOT NULL DEFAULT 'WARNING',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO order_sla_policies(status,max_minutes,escalation_level) VALUES
('PAID',10,'WARNING'),('COD_CONFIRMED',10,'WARNING'),('VENDOR_ACCEPTED',15,'WARNING'),('PREPARING',20,'HIGH'),
('READY_FOR_PICKUP',10,'HIGH'),('DELIVERY_ASSIGNED',15,'HIGH'),('PICKED_UP',10,'HIGH'),('OUT_FOR_DELIVERY',45,'URGENT')
ON CONFLICT(status) DO NOTHING;

CREATE TABLE IF NOT EXISTS order_sla_breaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status VARCHAR(40) NOT NULL,
  escalation_level VARCHAR(20) NOT NULL,
  age_minutes INTEGER NOT NULL,
  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_notified_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  UNIQUE(order_id,status)
);
CREATE INDEX IF NOT EXISTS idx_order_sla_open ON order_sla_breaches(resolved_at,escalation_level,first_detected_at) WHERE resolved_at IS NULL;

CREATE TABLE IF NOT EXISTS user_role_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  old_role user_role NOT NULL,
  new_role user_role NOT NULL,
  changed_by UUID REFERENCES users(id),
  reason VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_role_history_user ON user_role_history(user_id,created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_sla_status_updated ON orders(status,updated_at DESC);
