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

-- Keep inventory accounting explicit: stock_qty is available stock, reserved_qty is held stock.
