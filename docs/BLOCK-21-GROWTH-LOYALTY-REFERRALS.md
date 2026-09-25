# Block 21 — Growth, Loyalty, Referrals & Vendor Subscription Lifecycle

Implemented against the shared PostgreSQL backend.

## Implemented
- Customer loyalty account and transaction ledger.
- Automatic loyalty accrual after delivered orders with idempotency.
- Referral codes and referral application.
- Referral qualification on the referred customer's delivered order.
- Referral reward as loyalty points, with idempotent ledger entry.
- Vendor subscription plan listing and subscription state.
- Vendor subscription checkout-required state; no fake provider success.
- Provider-state endpoint for verified provider/webhook integration with event idempotency.
- Admin growth analytics: daily orders, GMV, platform fee, delivered orders, customers, vendors, subscription MRR, loyalty and referrals.
- Background growth worker for loyalty/referral processing.

## Production boundary
Vendor subscription payment is intentionally not marked ACTIVE by a client request. A real provider webhook/provider-state update must activate it.
