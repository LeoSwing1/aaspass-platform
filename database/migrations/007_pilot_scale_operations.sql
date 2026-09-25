-- AasPass Block 9: pilot + scale operations and customer preferences
CREATE TABLE IF NOT EXISTS platform_settings (
  key VARCHAR(120) PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO platform_settings(key,value) VALUES
  ('year1_vendor_target','{"value":10000,"unit":"vendors"}'),
  ('minimum_orders_per_vendor_day','{"value":100,"unit":"orders/vendor/day"}'),
  ('pilot_city','{"city":"Lucknow","state":"Uttar Pradesh"}'),
  ('pilot_stage','{"value":"CONTROLLED_PILOT"}')
ON CONFLICT(key) DO NOTHING;

CREATE TABLE IF NOT EXISTS market_launches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city VARCHAR(120) NOT NULL,
  state VARCHAR(120) NOT NULL,
  country VARCHAR(120) NOT NULL DEFAULT 'India',
  stage VARCHAR(30) NOT NULL DEFAULT 'PLANNED',
  status VARCHAR(30) NOT NULL DEFAULT 'PLANNED',
  target_vendors INTEGER NOT NULL DEFAULT 0 CHECK(target_vendors>=0),
  target_orders_per_vendor_day INTEGER NOT NULL DEFAULT 100 CHECK(target_orders_per_vendor_day>0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(city,state,country)
);

INSERT INTO market_launches(city,state,stage,status,target_vendors,target_orders_per_vendor_day,notes)
VALUES ('Lucknow','Uttar Pradesh','PILOT','ACTIVE',10000,100,'Initial controlled market for AasPass scale validation.')
ON CONFLICT(city,state,country) DO UPDATE SET
  stage=EXCLUDED.stage,
  status=EXCLUDED.status,
  target_vendors=EXCLUDED.target_vendors,
  target_orders_per_vendor_day=EXCLUDED.target_orders_per_vendor_day,
  updated_at=NOW();

CREATE TABLE IF NOT EXISTS vendor_activation_checks (
  vendor_id UUID PRIMARY KEY REFERENCES vendors(id) ON DELETE CASCADE,
  kyc_complete BOOLEAN NOT NULL DEFAULT FALSE,
  subscription_active BOOLEAN NOT NULL DEFAULT FALSE,
  catalog_ready BOOLEAN NOT NULL DEFAULT FALSE,
  service_zone_ready BOOLEAN NOT NULL DEFAULT FALSE,
  payment_ready BOOLEAN NOT NULL DEFAULT FALSE,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO vendor_activation_checks(vendor_id,kyc_complete,subscription_active,catalog_ready,service_zone_ready,payment_ready,verified)
SELECT v.id,
       EXISTS(SELECT 1 FROM vendor_kyc k WHERE k.vendor_id=v.id AND k.status='VERIFIED'),
       EXISTS(SELECT 1 FROM vendor_subscriptions s WHERE s.vendor_id=v.id AND s.status='ACTIVE'),
       EXISTS(SELECT 1 FROM products p WHERE p.vendor_id=v.id AND p.is_active=true),
       (v.latitude IS NOT NULL AND v.longitude IS NOT NULL),
       FALSE,
       FALSE
FROM vendors v
ON CONFLICT(vendor_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS customer_notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  order_updates BOOLEAN NOT NULL DEFAULT TRUE,
  delivery_updates BOOLEAN NOT NULL DEFAULT TRUE,
  payment_updates BOOLEAN NOT NULL DEFAULT TRUE,
  support_updates BOOLEAN NOT NULL DEFAULT TRUE,
  promotions BOOLEAN NOT NULL DEFAULT FALSE,
  product_offers BOOLEAN NOT NULL DEFAULT FALSE,
  push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  whatsapp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  sms_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO customer_notification_preferences(user_id)
SELECT id FROM users WHERE role='CUSTOMER'
ON CONFLICT(user_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_market_launches_status ON market_launches(status,city);
CREATE INDEX IF NOT EXISTS idx_vendor_activation_verified ON vendor_activation_checks(verified,updated_at DESC);
