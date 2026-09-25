-- AasPass Block 21: growth, loyalty, referrals and vendor subscription lifecycle
ALTER TABLE vendor_subscriptions ADD COLUMN IF NOT EXISTS provider_checkout_id VARCHAR(255);
ALTER TABLE vendor_subscriptions ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE vendor_subscriptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS loyalty_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  points BIGINT NOT NULL DEFAULT 0 CHECK(points>=0),
  lifetime_earned BIGINT NOT NULL DEFAULT 0 CHECK(lifetime_earned>=0),
  lifetime_redeemed BIGINT NOT NULL DEFAULT 0 CHECK(lifetime_redeemed>=0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loyalty_account_id UUID NOT NULL REFERENCES loyalty_accounts(id) ON DELETE CASCADE,
  direction VARCHAR(10) NOT NULL CHECK(direction IN ('EARN','REDEEM','ADJUST')),
  points BIGINT NOT NULL CHECK(points>0),
  source_type VARCHAR(40) NOT NULL,
  source_id VARCHAR(255),
  idempotency_key VARCHAR(255) UNIQUE,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_account_created ON loyalty_transactions(loyalty_account_id,created_at DESC);

CREATE TABLE IF NOT EXISTS referral_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  referral_code VARCHAR(24) NOT NULL UNIQUE,
  referred_by_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS referral_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id UUID NOT NULL REFERENCES users(id),
  referred_user_id UUID NOT NULL UNIQUE REFERENCES users(id),
  referral_code VARCHAR(24) NOT NULL,
  qualifying_order_id UUID UNIQUE REFERENCES orders(id),
  reward_points BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','QUALIFIED','REWARDED','VOID')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rewarded_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_referral_events_referrer ON referral_events(referrer_user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS vendor_subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_subscription_id UUID NOT NULL REFERENCES vendor_subscriptions(id) ON DELETE CASCADE,
  event_type VARCHAR(40) NOT NULL,
  provider_event_id VARCHAR(255),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_vendor_subscriptions_status_renew ON vendor_subscriptions(status,renews_at);
