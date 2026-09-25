# AasPass Block 20 — Transactional Commerce

## Scope

This block connects the commerce control-plane systems to the real customer checkout and fulfillment lifecycle.

### Implemented

- Server-side checkout quote endpoint.
- Server-side promotion validation during checkout.
- Customer wallet debit with row locking and idempotency.
- Wallet refund accounting.
- Inventory reservations tied to orders.
- Inventory release on customer/vendor/admin cancellation.
- Inventory commit when an order is delivered.
- Payment-failure inventory release and wallet restoration.
- Promotion redemption attached to the actual order.
- Checkout totals calculated from backend data rather than trusted Flutter totals.
- Cashfree refund amount separated from wallet refund amount.
- Admin inventory visibility.
- Customer checkout coupon application.
- Customer checkout wallet toggle.
- Customer profile wallet balance/recent transactions.

## Inventory accounting

`products.stock_qty` is available stock.

`products.reserved_qty` is held stock for live orders.

`inventory_reservations` records the exact order/product hold and its lifecycle:

`HELD -> COMMITTED` when delivered, or `HELD -> RELEASED` when cancelled/payment-failed.

## Money accounting

Customer order money remains separated into:

- product subtotal
- promotion discount
- delivery fee
- AasPass platform fee
- applicable platform GST
- wallet amount applied
- provider payable amount

Wallet money is never sent to Cashfree as if it were provider-collected money.

## Payment failure

If a Cashfree payment fails after wallet funds were used:

1. The order is marked `PAYMENT_FAILED`.
2. Inventory holds are released.
3. Wallet-applied funds are returned to the customer's wallet.
4. A normal order event/notification is generated.

## Production note

The payment architecture remains provider-backed but production activation still requires real Cashfree credentials, provider onboarding and deployment of a publicly reachable signed webhook endpoint.
