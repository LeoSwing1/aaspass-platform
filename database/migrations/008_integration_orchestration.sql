-- AasPass Block 10: integration orchestration, notification delivery and order events
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id,created_at DESC) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS notification_delivery_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  status VARCHAR(30) NOT NULL,
  provider_message_id VARCHAR(255),
  attempt_number INTEGER NOT NULL DEFAULT 1,
  error_message TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notification_attempts_notification ON notification_delivery_attempts(notification_id,attempted_at DESC);

CREATE TABLE IF NOT EXISTS order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_type VARCHAR(80) NOT NULL,
  source VARCHAR(40) NOT NULL,
  actor_user_id UUID REFERENCES users(id),
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_events_order_created ON order_events(order_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_events_type_created ON order_events(event_type,created_at DESC);

CREATE TABLE IF NOT EXISTS integration_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(100) NOT NULL,
  aggregate_type VARCHAR(100) NOT NULL,
  aggregate_id UUID,
  payload JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_integration_outbox_pending ON integration_outbox(status,available_at,created_at) WHERE status='PENDING';
