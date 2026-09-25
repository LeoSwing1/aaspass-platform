-- AasPass Block 9: customer identity + support customer lookup
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
    INSERT INTO customer_profiles(user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_aaspass_customer_profile ON users;
CREATE TRIGGER trg_aaspass_customer_profile
AFTER INSERT OR UPDATE OF role ON users
FOR EACH ROW EXECUTE FUNCTION aaspass_ensure_customer_profile();

INSERT INTO customer_profiles(user_id)
SELECT id FROM users WHERE role='CUSTOMER'
ON CONFLICT (user_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_users_customer_phone_lookup
  ON users(role, phone);
CREATE INDEX IF NOT EXISTS idx_orders_customer_status_created
  ON orders(customer_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_tickets_created
  ON support_tickets(requester_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_users_customer_phone_digits
  ON users ((RIGHT(regexp_replace(phone::text,'\D','','g'),10)))
  WHERE role='CUSTOMER';
