# AasPass Block 25 — Repeat Purchase Engine

This block connects the customer's previous successful purchases to the live cart.

## Implemented

- `GET /api/v1/customer/buy-again` returns products the authenticated customer actually purchased in delivered orders, grouped by product and ordered by the latest purchase.
- `POST /api/v1/customer/orders/:id/reorder` validates ownership and requires the source order to be `DELIVERED`.
- Reorder uses the current product catalog and current stock. Inactive/out-of-stock products are skipped rather than fabricated into the cart.
- A customer's existing cart cannot silently switch vendors. The API returns `CART_HAS_ANOTHER_VENDOR` when another vendor is already present.
- Quantities are capped by current stock and the cart safety limit.
- The operation is transactional and produces an audit event.
- Customer Flutter Orders now exposes **Buy again** for delivered orders and opens the live cart after a successful reorder.

## Data integrity

No new shadow product/order data is created. Reorder is derived from `orders`, `order_items`, `products`, and `customer_carts`.

## Production boundary

Reorder only prepares the cart. It does not create an order, reserve inventory, charge payment, or claim delivery success. The existing checkout transaction remains the only path that creates a payable order and reserves inventory.
