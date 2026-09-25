CREATE TABLE IF NOT EXISTS operational_alerts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 alert_type VARCHAR(60) NOT NULL,
 severity VARCHAR(20) NOT NULL CHECK(severity IN ('INFO','WARNING','HIGH','CRITICAL')),
 order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
 vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
 delivery_partner_id UUID REFERENCES delivery_partners(id) ON DELETE CASCADE,
 target_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
 title VARCHAR(255) NOT NULL,
 message TEXT NOT NULL,
 metadata JSONB NOT NULL DEFAULT '{}',
 status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','ACKNOWLEDGED','RESOLVED')),
 dedupe_key VARCHAR(255) UNIQUE NOT NULL,
 first_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 last_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 acknowledged_at TIMESTAMPTZ,
 resolved_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_operational_alerts_open ON operational_alerts(status,severity,last_detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_operational_alerts_order ON operational_alerts(order_id,status);
CREATE INDEX IF NOT EXISTS idx_operational_alerts_target ON operational_alerts(target_user_id,status,created_at DESC);
