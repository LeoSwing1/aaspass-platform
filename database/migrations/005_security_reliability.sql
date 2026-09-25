-- AasPass Block 8: session lifecycle + operational query indexes
CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jti UUID NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_active ON auth_sessions(user_id,expires_at DESC) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_orders_vendor_status_created ON orders(vendor_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_status_created ON orders(customer_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_assignments_status_created ON delivery_assignments(status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_pending ON notifications(status,created_at) WHERE status='PENDING';
