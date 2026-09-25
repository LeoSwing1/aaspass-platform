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
