# AasPass Block 19 — Commerce Control Plane

This block connects the operational platform around the existing customer/vendor/delivery/order core.

## Added

- Vendor onboarding activation checks and vendor-to-service-zone assignments.
- Delivery partner KYC workflow and onboarding events.
- Service-zone administration.
- Customer wallet accounts and auditable wallet transactions.
- Promotion campaigns, customer redemption limits and server-side promotion validation.
- Vendor settlement generation for delivered orders.
- Delivery partner settlement generation from completed delivery earnings/bonuses.
- Risk flag storage, behavioral scan and review lifecycle.
- Unified admin control-plane overview.

## Integration rules

- Wallet balances are PostgreSQL-backed and never fabricated in the API.
- Promotion validation checks activation window, global usage and per-customer usage before returning a discount.
- Settlement calculations use delivered orders/refunds and delivery assignment earnings already stored by AasPass.
- Vendor activation is only marked verified when all required readiness checks are true.
- Risk records are auditable and review actions identify the reviewing operator.
- Existing order, notification and audit services remain the source of operational events.

## Production note

Settlement generation currently creates auditable **PENDING** payout records. It intentionally does not pretend that a bank/UPI payout has happened. A real payout provider/PG payout credential must be configured before `PAID` is written by an external settlement adapter.
