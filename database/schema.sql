CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('SUPER_ADMIN','ADMIN','OPERATIONS_ADMIN','FINANCE_ADMIN','VENDOR_MANAGER','DELIVERY_MANAGER','SUPPORT_LEAD','SUPPORT_AGENT','VENDOR_OWNER','VENDOR_STAFF','DELIVERY_PARTNER','CUSTOMER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE vendor_status AS ENUM ('PENDING','ACTIVE','SUSPENDED','REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE order_status AS ENUM ('DRAFT','PLACED','PAYMENT_PENDING','PAYMENT_FAILED','PAID','COD_CONFIRMED','VENDOR_ACCEPTED','PREPARING','READY_FOR_PICKUP','DELIVERY_ASSIGNED','PICKED_UP','OUT_FOR_DELIVERY','DELIVERED','CANCELLED','REFUND_PENDING','REFUNDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('CREATED','PENDING','AUTHORIZED','PAID','FAILED','REFUNDED','PARTIALLY_REFUNDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), phone CITEXT UNIQUE, email CITEXT UNIQUE,
  name VARCHAR(120) NOT NULL, role user_role NOT NULL DEFAULT 'CUSTOMER',
  is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label VARCHAR(40), line1 VARCHAR(255) NOT NULL, line2 VARCHAR(255), locality VARCHAR(120), city VARCHAR(120) NOT NULL,
  state VARCHAR(120) NOT NULL, postal_code VARCHAR(20) NOT NULL, latitude NUMERIC(10,7), longitude NUMERIC(10,7),
  is_default BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS service_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), city VARCHAR(120) NOT NULL, name VARCHAR(120) NOT NULL,
  radius_m INTEGER, center_latitude NUMERIC(10,7), center_longitude NUMERIC(10,7), is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS vendor_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code VARCHAR(30) UNIQUE NOT NULL, name VARCHAR(80) NOT NULL,
  monthly_price_paise BIGINT NOT NULL CHECK (monthly_price_paise >= 0), features JSONB NOT NULL DEFAULT '{}', is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), owner_user_id UUID REFERENCES users(id), plan_id UUID REFERENCES vendor_plans(id),
  name VARCHAR(255) NOT NULL, slug VARCHAR(255) UNIQUE NOT NULL, status vendor_status NOT NULL DEFAULT 'PENDING',
  rating NUMERIC(2,1) NOT NULL DEFAULT 0 CHECK (rating BETWEEN 0 AND 5), review_count INTEGER NOT NULL DEFAULT 0,
  is_open BOOLEAN NOT NULL DEFAULT TRUE, phone VARCHAR(20), address_line1 VARCHAR(255), locality VARCHAR(120), city VARCHAR(120), state VARCHAR(120), postal_code VARCHAR(20),
  latitude NUMERIC(10,7), longitude NUMERIC(10,7), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS vendor_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(30) NOT NULL DEFAULT 'VENDOR_STAFF', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(vendor_id,user_id)
);
CREATE TABLE IF NOT EXISTS vendor_kyc (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), vendor_id UUID NOT NULL UNIQUE REFERENCES vendors(id) ON DELETE CASCADE,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING', documents JSONB NOT NULL DEFAULT '[]', reviewed_by UUID REFERENCES users(id), reviewed_at TIMESTAMPTZ, notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS vendor_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE, plan_id UUID NOT NULL REFERENCES vendor_plans(id),
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE', starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), renews_at TIMESTAMPTZ,
  provider_customer_id VARCHAR(255), provider_subscription_id VARCHAR(255), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(120) UNIQUE NOT NULL, slug VARCHAR(120) UNIQUE NOT NULL,
  icon_key VARCHAR(80), sort_order INTEGER NOT NULL DEFAULT 0, is_active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE, category_id UUID REFERENCES categories(id),
  name VARCHAR(255) NOT NULL, description TEXT, unit_label VARCHAR(80), price_paise BIGINT NOT NULL CHECK(price_paise>=0),
  compare_at_price_paise BIGINT CHECK(compare_at_price_paise IS NULL OR compare_at_price_paise>=price_paise), image_url TEXT,
  stock_qty INTEGER NOT NULL DEFAULT 0, reserved_qty INTEGER NOT NULL DEFAULT 0, is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS customer_carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), customer_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  vendor_id UUID REFERENCES vendors(id), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), cart_id UUID NOT NULL REFERENCES customer_carts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL CHECK(quantity>0), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(cart_id,product_id)
);
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), customer_id UUID NOT NULL REFERENCES users(id), vendor_id UUID NOT NULL REFERENCES vendors(id), delivery_address_id UUID REFERENCES addresses(id),
  status order_status NOT NULL DEFAULT 'DRAFT', subtotal_paise BIGINT NOT NULL CHECK(subtotal_paise>=0), delivery_fee_paise BIGINT NOT NULL CHECK(delivery_fee_paise>=0),
  platform_fee_paise BIGINT NOT NULL DEFAULT 100 CHECK(platform_fee_paise>=0), platform_gst_paise BIGINT NOT NULL DEFAULT 0 CHECK(platform_gst_paise>=0),
  payment_processing_fee_paise BIGINT NOT NULL DEFAULT 0 CHECK(payment_processing_fee_paise>=0), total_paise BIGINT NOT NULL CHECK(total_paise>=0), currency CHAR(3) NOT NULL DEFAULT 'INR',
  idempotency_key VARCHAR(255) UNIQUE, placed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE, product_id UUID NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK(quantity>0), unit_price_paise BIGINT NOT NULL CHECK(unit_price_paise>=0), line_total_paise BIGINT NOT NULL CHECK(line_total_paise>=0)
);
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE, method VARCHAR(30) NOT NULL,
  status payment_status NOT NULL DEFAULT 'CREATED', provider VARCHAR(80), provider_order_id VARCHAR(255), provider_payment_id VARCHAR(255), amount_paise BIGINT NOT NULL CHECK(amount_paise>=0), currency CHAR(3) NOT NULL DEFAULT 'INR',
  raw_response JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ledger_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code VARCHAR(80) UNIQUE NOT NULL, owner_type VARCHAR(30) NOT NULL, owner_id UUID, currency CHAR(3) NOT NULL DEFAULT 'INR', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), order_id UUID REFERENCES orders(id), account_id UUID NOT NULL REFERENCES ledger_accounts(id), entry_type VARCHAR(40) NOT NULL,
  direction VARCHAR(10) NOT NULL CHECK(direction IN ('CREDIT','DEBIT')), amount_paise BIGINT NOT NULL CHECK(amount_paise>0), reference_type VARCHAR(50), reference_id VARCHAR(255), metadata JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS delivery_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE, status VARCHAR(30) NOT NULL DEFAULT 'OFFLINE', mode VARCHAR(30), kyc_status VARCHAR(30) NOT NULL DEFAULT 'PENDING', latitude NUMERIC(10,7), longitude NUMERIC(10,7), last_seen_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS delivery_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE, delivery_partner_id UUID REFERENCES delivery_partners(id), status VARCHAR(30) NOT NULL DEFAULT 'OFFERED',
  pickup_latitude NUMERIC(10,7), pickup_longitude NUMERIC(10,7), drop_latitude NUMERIC(10,7), drop_longitude NUMERIC(10,7), accepted_at TIMESTAMPTZ, picked_up_at TIMESTAMPTZ, delivered_at TIMESTAMPTZ, proof JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  earning_paise BIGINT NOT NULL DEFAULT 0 CHECK (earning_paise>=0), bonus_paise BIGINT NOT NULL DEFAULT 0 CHECK (bonus_paise>=0), cancelled_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), requester_user_id UUID NOT NULL REFERENCES users(id), order_id UUID REFERENCES orders(id), subject VARCHAR(255) NOT NULL, description TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'OPEN', priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL', assigned_to UUID REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, channel VARCHAR(30) NOT NULL, title VARCHAR(255) NOT NULL, body TEXT NOT NULL, data JSONB NOT NULL DEFAULT '{}', status VARCHAR(30) NOT NULL DEFAULT 'PENDING', sent_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, platform VARCHAR(20) NOT NULL, token TEXT NOT NULL UNIQUE, is_active BOOLEAN NOT NULL DEFAULT TRUE, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), actor_user_id UUID REFERENCES users(id), action VARCHAR(100) NOT NULL, entity_type VARCHAR(100) NOT NULL, entity_id UUID, metadata JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_vendor_active ON products(vendor_id,is_active);
CREATE INDEX IF NOT EXISTS idx_orders_customer_created ON orders(customer_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_vendor_created ON orders(vendor_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_delivery_partner_status ON delivery_partners(status);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type,entity_id,created_at DESC);

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL REFERENCES users(id),
  message TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support_ticket_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id),
  event_type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status_priority ON support_tickets(status,priority,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_created ON support_ticket_messages(ticket_id,created_at);
CREATE INDEX IF NOT EXISTS idx_support_events_ticket_created ON support_ticket_events(ticket_id,created_at DESC);


-- Migration 004: payment webhook idempotency ledger
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

-- Customer identity & support lookup (Block 9)
CREATE SEQUENCE IF NOT EXISTS aaspass_customer_code_seq START WITH 100001 INCREMENT BY 1;
CREATE TABLE IF NOT EXISTS customer_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  customer_code VARCHAR(32) UNIQUE NOT NULL DEFAULT ('AAS-CUS-' || LPAD(nextval('aaspass_customer_code_seq')::text, 6, '0')),
  referral_code VARCHAR(32) UNIQUE,
  preferred_language VARCHAR(12) NOT NULL DEFAULT 'en-IN',
  marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  last_service_zone_id UUID REFERENCES service_zones(id),
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customer_profiles_code ON customer_profiles(customer_code);
CREATE INDEX IF NOT EXISTS idx_customer_profiles_last_zone ON customer_profiles(last_service_zone_id);
CREATE OR REPLACE FUNCTION aaspass_ensure_customer_profile()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role = 'CUSTOMER' THEN
    INSERT INTO customer_profiles(user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_aaspass_customer_profile ON users;
CREATE TRIGGER trg_aaspass_customer_profile AFTER INSERT OR UPDATE OF role ON users FOR EACH ROW EXECUTE FUNCTION aaspass_ensure_customer_profile();
INSERT INTO customer_profiles(user_id) SELECT id FROM users WHERE role='CUSTOMER' ON CONFLICT (user_id) DO NOTHING;
CREATE INDEX IF NOT EXISTS idx_users_customer_phone_lookup ON users(role,phone);
CREATE INDEX IF NOT EXISTS idx_orders_customer_status_created ON orders(customer_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_tickets_created ON support_tickets(requester_user_id,created_at DESC);

CREATE INDEX IF NOT EXISTS idx_users_customer_phone_digits
  ON users ((RIGHT(regexp_replace(phone::text,'\D','','g'),10)))
  WHERE role='CUSTOMER';
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
-- AasPass Block 11: end-to-end transaction integrity + fulfillment controls
ALTER TABLE orders ADD COLUMN IF NOT EXISTS vendor_accepted_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS preparing_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ready_for_pickup_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_assigned_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS pickup_otp_hash TEXT;
ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS drop_otp_hash TEXT;
ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS pickup_otp_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS drop_otp_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS last_location_at TIMESTAMPTZ;

ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);
CREATE UNIQUE INDEX IF NOT EXISTS ux_ledger_entries_idempotency_key ON ledger_entries(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_delivery_assignments_partner_status ON delivery_assignments(delivery_partner_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_fulfillment_status ON orders(status,updated_at DESC);

-- Operationally safe, non-financially-authoritative outbox entries can be retried.
CREATE INDEX IF NOT EXISTS idx_outbox_aggregate ON integration_outbox(aggregate_type,aggregate_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount_paise BIGINT NOT NULL CHECK(amount_paise>0),
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  provider VARCHAR(80),
  provider_ref VARCHAR(255),
  reason VARCHAR(255),
  created_by UUID REFERENCES users(id),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refunds_order_created ON refunds(order_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_refund_order_pending ON refunds(order_id) WHERE status IN ('PENDING','PROCESSING');

ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS pickup_otp_ciphertext TEXT;
ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS pickup_otp_iv TEXT;
ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS pickup_otp_tag TEXT;
ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS drop_otp_ciphertext TEXT;
ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS drop_otp_iv TEXT;
ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS drop_otp_tag TEXT;
CREATE INDEX IF NOT EXISTS idx_delivery_assignments_order_status ON delivery_assignments(order_id,status);
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

-- AasPass Block 20: transactional checkout, wallet/coupon application and inventory reservations
ALTER TABLE orders ADD COLUMN IF NOT EXISTS promotion_id UUID REFERENCES promotions(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS promotion_code VARCHAR(40);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_paise BIGINT NOT NULL DEFAULT 0 CHECK(discount_paise>=0);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS wallet_applied_paise BIGINT NOT NULL DEFAULT 0 CHECK(wallet_applied_paise>=0);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cashfree_refund_paise BIGINT NOT NULL DEFAULT 0 CHECK(cashfree_refund_paise>=0);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS wallet_refund_paise BIGINT NOT NULL DEFAULT 0 CHECK(wallet_refund_paise>=0);
CREATE TABLE IF NOT EXISTS inventory_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK(quantity>0),
  status VARCHAR(20) NOT NULL DEFAULT 'HELD' CHECK(status IN ('HELD','COMMITTED','RELEASED')),
  held_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ,
  committed_at TIMESTAMPTZ,
  UNIQUE(order_id,product_id)
);
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_order_status ON inventory_reservations(order_id,status);
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_product_status ON inventory_reservations(product_id,status);
CREATE INDEX IF NOT EXISTS idx_orders_promotion ON orders(promotion_id);
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
-- AasPass Block 24: customer account commerce surfaces.
-- Wishlist, shopping lists, reviews, saved provider references and gift-card ledger.

CREATE TABLE IF NOT EXISTS customer_wishlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_customer_wishlists_user ON customer_wishlists(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS shopping_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS shopping_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0 AND quantity <= 99),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(list_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_shopping_lists_user ON shopping_lists(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_shopping_list_items_list ON shopping_list_items(list_id);

CREATE TABLE IF NOT EXISTS product_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  vendor_id UUID NOT NULL REFERENCES vendors(id),
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  review_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, order_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_product_reviews_user ON product_reviews(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_reviews_vendor ON product_reviews(vendor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS saved_payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(80) NOT NULL,
  provider_reference VARCHAR(255) NOT NULL,
  brand VARCHAR(40),
  last4 VARCHAR(4),
  expiry_month SMALLINT,
  expiry_year SMALLINT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, provider_reference)
);
CREATE INDEX IF NOT EXISTS idx_saved_payment_methods_user ON saved_payment_methods(user_id, is_default DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS gift_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash VARCHAR(128) NOT NULL UNIQUE,
  code_last4 VARCHAR(4) NOT NULL,
  initial_balance_paise BIGINT NOT NULL CHECK(initial_balance_paise > 0),
  balance_paise BIGINT NOT NULL CHECK(balance_paise >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REDEEMED','EXPIRED','DISABLED')),
  issued_to_user_id UUID REFERENCES users(id),
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gift_cards_user ON gift_cards(issued_to_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS gift_card_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_card_id UUID NOT NULL REFERENCES gift_cards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  direction VARCHAR(10) NOT NULL CHECK(direction IN ('CREDIT','DEBIT')),
  amount_paise BIGINT NOT NULL CHECK(amount_paise > 0),
  reference_type VARCHAR(50) NOT NULL,
  reference_id VARCHAR(255),
  idempotency_key VARCHAR(255) UNIQUE,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gift_card_transactions_card ON gift_card_transactions(gift_card_id, created_at DESC);

-- AasPass Block 25: repeat-purchase engine indexes.
CREATE INDEX IF NOT EXISTS idx_order_items_order_product ON order_items(order_id, product_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_status_created ON orders(customer_id, status, created_at DESC);


-- AasPass Block 26: personalized commerce engine.
-- Feed data is derived from transactional history; no shadow customer/product catalog is created.
CREATE INDEX IF NOT EXISTS idx_order_items_product_order ON order_items(product_id, order_id);
CREATE INDEX IF NOT EXISTS idx_products_category_active_stock ON products(category_id, is_active, stock_qty);
CREATE INDEX IF NOT EXISTS idx_orders_customer_delivered_created ON orders(customer_id, status, created_at DESC);

-- Block 27: membership, targeted campaigns and growth analytics.
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
-- AasPass Block 28: durable domain integration outbox.
CREATE TABLE IF NOT EXISTS integration_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(100) NOT NULL,
  aggregate_type VARCHAR(80) NOT NULL,
  aggregate_id UUID NOT NULL,
  actor_user_id UUID REFERENCES users(id),
  payload JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSING','PROCESSED','FAILED')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_integration_outbox_pending ON integration_outbox(status,available_at,created_at);
CREATE INDEX IF NOT EXISTS idx_integration_outbox_aggregate ON integration_outbox(aggregate_type,aggregate_id,created_at DESC);
-- AasPass Block 28: durable domain integration outbox.
CREATE TABLE IF NOT EXISTS integration_outbox (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),event_type VARCHAR(100) NOT NULL,aggregate_type VARCHAR(80) NOT NULL,aggregate_id UUID NOT NULL,actor_user_id UUID REFERENCES users(id),payload JSONB NOT NULL DEFAULT '{}',status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSING','PROCESSED','FAILED')),attempts INTEGER NOT NULL DEFAULT 0,available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),processed_at TIMESTAMPTZ,last_error TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX IF NOT EXISTS idx_integration_outbox_pending ON integration_outbox(status,available_at,created_at);
CREATE INDEX IF NOT EXISTS idx_integration_outbox_aggregate ON integration_outbox(aggregate_type,aggregate_id,created_at DESC);

-- AasPass Block 29: unified operations + finance/provider reconciliation
CREATE TABLE IF NOT EXISTS finance_reconciliation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), run_type VARCHAR(40) NOT NULL, status VARCHAR(30) NOT NULL DEFAULT 'RUNNING',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), finished_at TIMESTAMPTZ, checked_count INTEGER NOT NULL DEFAULT 0,
  matched_count INTEGER NOT NULL DEFAULT 0, mismatch_count INTEGER NOT NULL DEFAULT 0, summary JSONB NOT NULL DEFAULT '{}', created_by UUID REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS finance_reconciliation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), run_id UUID NOT NULL REFERENCES finance_reconciliation_runs(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id), payment_id UUID REFERENCES payments(id), item_type VARCHAR(50) NOT NULL,
  expected_paise BIGINT, observed_paise BIGINT, status VARCHAR(30) NOT NULL, details JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS provider_reconciliation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), provider VARCHAR(50) NOT NULL, status VARCHAR(30) NOT NULL DEFAULT 'RUNNING',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), finished_at TIMESTAMPTZ, checked_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0, mismatch_count INTEGER NOT NULL DEFAULT 0, summary JSONB NOT NULL DEFAULT '{}', created_by UUID REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS provider_reconciliation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), run_id UUID NOT NULL REFERENCES provider_reconciliation_runs(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES payments(id), order_id UUID REFERENCES orders(id), provider VARCHAR(50) NOT NULL,
  local_status VARCHAR(30), provider_status VARCHAR(50), amount_paise BIGINT, provider_amount_paise BIGINT,
  status VARCHAR(30) NOT NULL, details JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fin_recon_items_run_status ON finance_reconciliation_items(run_id,status);
CREATE INDEX IF NOT EXISTS idx_provider_recon_items_run_status ON provider_reconciliation_items(run_id,status);
CREATE INDEX IF NOT EXISTS idx_provider_recon_runs_created ON provider_reconciliation_runs(created_at DESC);

CREATE TABLE IF NOT EXISTS operational_alerts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), alert_type VARCHAR(60) NOT NULL,
 severity VARCHAR(20) NOT NULL CHECK(severity IN ('INFO','WARNING','HIGH','CRITICAL')),
 order_id UUID REFERENCES orders(id) ON DELETE CASCADE, vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
 delivery_partner_id UUID REFERENCES delivery_partners(id) ON DELETE CASCADE, target_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
 title VARCHAR(255) NOT NULL, message TEXT NOT NULL, metadata JSONB NOT NULL DEFAULT '{}',
 status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','ACKNOWLEDGED','RESOLVED')),
 dedupe_key VARCHAR(255) UNIQUE NOT NULL, first_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 acknowledged_at TIMESTAMPTZ, resolved_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_operational_alerts_open ON operational_alerts(status,severity,last_detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_operational_alerts_order ON operational_alerts(order_id,status);
CREATE INDEX IF NOT EXISTS idx_operational_alerts_target ON operational_alerts(target_user_id,status,created_at DESC);
