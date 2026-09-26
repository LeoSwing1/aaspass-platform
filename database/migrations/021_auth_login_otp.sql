CREATE TABLE IF NOT EXISTS auth_login_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  phone CITEXT NOT NULL,

  otp_hash TEXT NOT NULL,
  otp_salt TEXT NOT NULL,

  attempts INTEGER NOT NULL DEFAULT 0
    CHECK (attempts >= 0),

  max_attempts INTEGER NOT NULL DEFAULT 5
    CHECK (max_attempts > 0),

  expires_at TIMESTAMPTZ NOT NULL,

  consumed_at TIMESTAMPTZ,

  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  ip_address INET,
  user_agent TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_login_otps_phone_latest
  ON auth_login_otps(phone, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_login_otps_expiry
  ON auth_login_otps(expires_at);

CREATE INDEX IF NOT EXISTS idx_auth_login_otps_active
  ON auth_login_otps(phone, expires_at DESC)
  WHERE consumed_at IS NULL;