# Block 9 — Pilot & Connectivity Sweep

## Goal
Turn the master workspace into one connected platform before scaling beyond the pilot.

## Executed
- Removed the accidental nested v1.8 workspace from the distributable master root.
- Added a root orchestration package.json for repeatable local commands.
- Added a structure audit script.
- Added authenticated customer APIs for serviceability, categories, vendors, products, cart and orders.
- Added server-authoritative order totals and idempotency handling.
- Added paise-based platform-fee and GST ledger entries at order creation.
- Added a Flutter customer API client against the shared backend.
- Updated the customer app dependency manifest with `http`.

## Connectivity map
Customer Flutter -> /api/v1/customer -> PostgreSQL
Vendor web -> /api/v1/vendor -> PostgreSQL
Delivery Flutter -> /api/v1/delivery -> PostgreSQL
Support web -> /api/v1/support -> PostgreSQL
Admin web -> /api/v1/admin -> PostgreSQL
Payments -> /api/v1/integrations -> Cashfree adapter -> webhook -> payment_webhook_events
Maps -> /api/v1/integrations -> route/serviceability adapters
Notifications -> /api/v1/integrations -> device token / FCM provider

## Pilot control rules
- Start with a small verified locality and real vendor/delivery records.
- Expand a zone only after serviceability, order density, delivery supply and support SLAs are measurable.
- Keep production payment credentials and provider callbacks off developer machines.

## Remaining validation
The API/database flows require a local PostgreSQL runtime for integration tests. Flutter and native builds require the developer toolchain and platform credentials.
