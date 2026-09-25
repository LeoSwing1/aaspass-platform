CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL,
  event_key VARCHAR(255) NOT NULL,
  order_id VARCHAR(255),
  event_type VARCHAR(120) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  processing_error TEXT,
  UNIQUE(provider,event_key)
);

CREATE INDEX IF NOT EXISTS idx_payment_webhooks_order ON payment_webhook_events(provider,order_id,received_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_webhooks_type ON payment_webhook_events(provider,event_type,received_at DESC);
