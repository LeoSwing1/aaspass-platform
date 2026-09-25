-- AasPass Block 27: membership, targeted campaigns and growth analytics.
CREATE TABLE IF NOT EXISTS membership_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(40) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  monthly_price_paise BIGINT NOT NULL CHECK(monthly_price_paise >= 0),
  annual_price_paise BIGINT CHECK(annual_price_paise IS NULL OR annual_price_paise >= 0),
  benefits JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS customer_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES membership_plans(id),
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACTIVE','PAST_DUE','CANCELLED','EXPIRED')),
  starts_at TIMESTAMPTZ,
  renews_at TIMESTAMPTZ,
  provider_customer_id VARCHAR(255),
  provider_subscription_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_customer_active_membership ON customer_memberships(user_id) WHERE status='ACTIVE';
CREATE INDEX IF NOT EXISTS idx_customer_memberships_user ON customer_memberships(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS membership_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id UUID NOT NULL REFERENCES customer_memberships(id) ON DELETE CASCADE,
  event_type VARCHAR(60) NOT NULL,
  provider_event_id VARCHAR(255) UNIQUE,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS audience VARCHAR(30) NOT NULL DEFAULT 'ALL';
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES vendors(id);
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id);
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS service_zone_id UUID REFERENCES service_zones(id);
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS min_orders INTEGER NOT NULL DEFAULT 0;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS min_spend_paise BIGINT NOT NULL DEFAULT 0;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS membership_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS loyalty_min_points BIGINT NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS membership_id UUID REFERENCES customer_memberships(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS membership_discount_paise BIGINT NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_promotions_target_vendor ON promotions(vendor_id,is_active,starts_at,ends_at);
CREATE INDEX IF NOT EXISTS idx_promotions_target_category ON promotions(category_id,is_active,starts_at,ends_at);
CREATE INDEX IF NOT EXISTS idx_promotions_target_zone ON promotions(service_zone_id,is_active,starts_at,ends_at);
CREATE INDEX IF NOT EXISTS idx_orders_membership ON orders(membership_id,created_at DESC);

INSERT INTO membership_plans(code,name,monthly_price_paise,annual_price_paise,benefits)
VALUES ('PLUS','AasPass Plus',14900,149900,'{"freeDeliveryMinOrderPaise":19900,"waivePlatformFee":true,"description":"Member delivery and platform-fee benefits"}')
ON CONFLICT(code) DO NOTHING;
