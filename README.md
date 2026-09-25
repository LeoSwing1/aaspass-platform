# AasPass Master v3.7 — Block 20

One master workspace for the AasPass platform operated by Bharat Infotechs while AasPass is being developed as its product/brand.

## Apps
- `apps/customer` — Flutter customer experience
- `apps/vendor` — Flutter vendor mobile application
- `apps/delivery-partner` — Flutter delivery application
- `apps/support` — web support console
- `apps/admin` — AasPass HQ / Super Admin

## Core
- `backend` — shared API
- `database` — PostgreSQL schema and migrations
- `packages` — shared contracts/config/UI
- `docs` — architecture, flows, security and block execution

## Operating targets
- 10,000 vendors in Year 1
- minimum 100 orders/vendor/day target density
- 1,000,000 orders/day implied at full Year-1 target achievement

## Development authentication
OTP `270303` exists only for development authentication when enabled. It must be disabled in production.

## Block 18 operations automation
- 90-second delivery offer expiry and automatic dispatch retry
- delivery assignment offer history
- configurable order SLA policies and breach alerts
- server-side Cashfree refund lifecycle with provider status synchronization
- audited RBAC role changes with self-downgrade protection

## Platform foundation history
End-to-end transaction integrity and fulfillment controls:
- platform-fee/GST ledger recognition on confirmed payment/COD
- auto-nearest delivery dispatch
- delivery OTPs and proof
- customer tracking/timeline
- cancellation + refund staging
- finance reconciliation
- API worker for pending notifications

Provider credentials and real marketplace settlement configuration remain environment/compliance tasks and are not committed to the repository.


## Latest customer-app hardening (v2.5)
The customer Flutter surface received a major UI/UX hardening pass: overflow-safe category and product grids, animated banners, richer nearby-store cards, local product/store imagery, popular-dishes discovery, upgraded notifications and checkout, improved location-permission recovery/open-settings behavior, native reverse-geocoded location labels, and a launch/resume splash overlay.


## v2.6 Customer UI
The customer app has a materially redesigned commerce home, safer category/product layouts, richer vendor/store cards, upgraded checkout, and native location-permission guidance. See `docs/blocks/BLOCK-12-CUSTOMER-UI-V26.md`.


## v2.6 Customer UI hardening
The customer app was materially redesigned rather than merely documented: new commerce home sections, image-backed categories, richer vendor cards, expanded products, responsive grids, checkout refresh, and clearer location permission recovery.

## Block 19 commerce control plane
- vendor onboarding readiness and service-zone assignments
- delivery partner KYC onboarding workflow
- database-backed customer wallets and auditable credits
- promotion campaigns with server-side validation and usage limits
- vendor and delivery settlement generation as auditable PENDING payout records
- risk flags, behavioral scan and operator review lifecycle
- Admin HQ Control Plane surface for the new operational layer
