-- AasPass Block 25: repeat-purchase / buy-again engine.
-- Reorder state is intentionally derived from delivered orders + live product inventory;
-- no duplicate cart or product shadow tables are introduced.
CREATE INDEX IF NOT EXISTS idx_order_items_order_product ON order_items(order_id, product_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_status_created ON orders(customer_id, status, created_at DESC);
