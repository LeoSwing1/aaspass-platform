-- AasPass Block 19: commerce control plane, wallets, promotions, settlements, risk and service-zone governance

CREATE TABLE IF NOT EXISTS vendor_service_zones (
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  service_zone_id UUID NOT NULL REFERENCES service_zones(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(vendor_id,service_zone_id)
);
CREATE INDEX IF NOT EXISTS idx_vendor_service_zones_zone ON vendor_service_zones(service_zone_id,is_active);

CREATE TABLE IF NOT EXISTS wallet_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  balance_paise BIGINT NOT NULL DEFAULT 0 CHECK(balance_paise>=0),
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES wallet_accounts(id) ON DELETE CASCADE,
  direction VARCHAR(10) NOT NULL CHECK(direction IN ('CREDIT','DEBIT')),
  amount_paise BIGINT NOT NULL CHECK(amount_paise>0),
  transaction_type VARCHAR(40) NOT NULL,
  reference_type VARCHAR(40),
  reference_id VARCHAR(255),
  idempotency_key VARCHAR(255) UNIQUE,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_created ON wallet_transactions(wallet_id,created_at DESC);

CREATE TABLE IF NOT EXISTS promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(40) UNIQUE NOT NULL,
  title VARCHAR(120) NOT NULL,
  description TEXT,
  discount_type VARCHAR(20) NOT NULL CHECK(discount_type IN ('PERCENT','FLAT')),
  discount_value BIGINT NOT NULL CHECK(discount_value>0),
  max_discount_paise BIGINT CHECK(max_discount_paise IS NULL OR max_discount_paise>0),
  min_order_paise BIGINT NOT NULL DEFAULT 0 CHECK(min_order_paise>=0),
  usage_limit INTEGER CHECK(usage_limit IS NULL OR usage_limit>0),
  per_customer_limit INTEGER NOT NULL DEFAULT 1 CHECK(per_customer_limit>0),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS promotion_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  discount_paise BIGINT NOT NULL CHECK(discount_paise>=0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(promotion_id,user_id,order_id)
);
CREATE INDEX IF NOT EXISTS idx_promotion_redemptions_user ON promotion_redemptions(user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS vendor_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  gross_sales_paise BIGINT NOT NULL DEFAULT 0,
  platform_fee_paise BIGINT NOT NULL DEFAULT 0,
  gst_paise BIGINT NOT NULL DEFAULT 0,
  refunds_paise BIGINT NOT NULL DEFAULT 0,
  net_payout_paise BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  provider_reference VARCHAR(255),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(vendor_id,period_start,period_end)
);
CREATE TABLE IF NOT EXISTS delivery_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_partner_id UUID NOT NULL REFERENCES delivery_partners(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  base_earning_paise BIGINT NOT NULL DEFAULT 0,
  bonus_paise BIGINT NOT NULL DEFAULT 0,
  adjustments_paise BIGINT NOT NULL DEFAULT 0,
  net_payout_paise BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  provider_reference VARCHAR(255),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(delivery_partner_id,period_start,period_end)
);
CREATE INDEX IF NOT EXISTS idx_vendor_settlements_status ON vendor_settlements(status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_settlements_status ON delivery_settlements(status,created_at DESC);

CREATE TABLE IF NOT EXISTS risk_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  risk_type VARCHAR(50) NOT NULL,
  score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 100),
  severity VARCHAR(20) NOT NULL CHECK(severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','REVIEWED','RESOLVED','DISMISSED')),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_risk_flags_open ON risk_flags(status,severity,created_at DESC);

CREATE TABLE IF NOT EXISTS vendor_onboarding_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  step VARCHAR(50) NOT NULL,
  status VARCHAR(30) NOT NULL,
  notes TEXT,
  actor_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS delivery_onboarding_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_partner_id UUID NOT NULL REFERENCES delivery_partners(id) ON DELETE CASCADE,
  step VARCHAR(50) NOT NULL,
  status VARCHAR(30) NOT NULL,
  notes TEXT,
  actor_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_onboarding_vendor ON vendor_onboarding_events(vendor_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_onboarding_partner ON delivery_onboarding_events(delivery_partner_id,created_at DESC);

-- Give every existing customer a real wallet account without inventing a balance.
INSERT INTO wallet_accounts(user_id)
SELECT id FROM users WHERE role='CUSTOMER'
ON CONFLICT(user_id) DO NOTHING;
