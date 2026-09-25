-- AasPass Block 26: personalized commerce engine.
-- Feed data is derived from transactional history; no shadow customer/product catalog is created.
CREATE INDEX IF NOT EXISTS idx_order_items_product_order ON order_items(product_id, order_id);
CREATE INDEX IF NOT EXISTS idx_products_category_active_stock ON products(category_id, is_active, stock_qty);
CREATE INDEX IF NOT EXISTS idx_orders_customer_delivered_created ON orders(customer_id, status, created_at DESC);
