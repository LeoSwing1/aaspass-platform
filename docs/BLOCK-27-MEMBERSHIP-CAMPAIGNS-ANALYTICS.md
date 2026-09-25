# Block 27 — Membership, Targeted Campaigns & Growth Analytics

AasPass v3.14 extends the shared commerce backend with a membership layer, targeted promotion eligibility, and vendor/admin growth analytics.

## Implemented

### AasPass Plus
- PostgreSQL-backed `membership_plans`, `customer_memberships`, and `membership_events`.
- Customer can read plans and current membership.
- Starting a membership creates `PENDING` state and explicitly returns `PROVIDER_CHECKOUT_REQUIRED`.
- Admin/provider state endpoint is idempotent by provider event id.
- Active membership benefits are applied by the authoritative checkout quote/order flow.
- Current Plus benefits: free delivery above a configured minimum and platform-fee/GST waiver.
- No fake provider success is generated.

### Targeted campaigns
Promotions can now target:
- customer audience (`ALL`, `NEW_CUSTOMER`, `REPEAT_CUSTOMER`, `MEMBERS`)
- vendor
- category
- service zone coverage
- minimum delivered-order count
- minimum delivered spend
- membership requirement
- minimum loyalty points

Checkout validates these conditions again on the server before creating the order.

### Customer app
- Rewards screen exposes AasPass Plus plans and membership state.
- Profile exposes an AasPass Plus entry point.
- Checkout consumes the backend quote so membership savings are visible and not calculated only on-device.

### Vendor analytics
Vendor API now exposes a real 7–90 day window containing:
- orders
- delivered orders
- GMV
- delivered AOV
- customers
- repeat customers
- product units/revenue

### Admin analytics
Growth analytics now includes:
- active AasPass Plus members
- membership MRR
- active campaigns
- campaign redemptions
- existing GMV/AOV/repeat-customer/loyalty/referral metrics

## Provider boundary
Membership activation remains provider-confirmed. A `PENDING` membership is never treated as active for checkout benefits.
