# Block 4 — Delivery Partner App

## Goal
Create the AasPass delivery surface on the same backend and database as Customer/Vendor/Admin.

## Implemented in v1.4
- Flutter delivery partner application shell
- Location permission + current position
- Online/offline availability
- Nearby offered jobs with radius filtering
- Accept assignment
- Server-side assignment locking to prevent double acceptance
- Delivery lifecycle: ACCEPTED → PICKED_UP → OUT_FOR_DELIVERY → DELIVERED
- Partner earnings summary and recent deliveries
- Profile/KYC/safety surface
- Backend routes under `/api/v1/delivery`
- Delivery migration for authoritative earning/bonus fields
- Audit events for status and acceptance

## Money boundary
Delivery partner earnings are tracked separately from vendor product value and AasPass platform revenue. Delivery earnings should settle through the approved payout architecture, not through ad-hoc direct transfers from the application layer.

## Security
- Role-based route protection
- Assignment ownership enforced server-side
- Assignment acceptance uses a database row lock/transaction
- Allowed delivery transitions are enforced server-side
- Location writes authenticated to the current partner
- Audit logs on partner status and assignment actions

## Next hardening
- Push notification job offers
- Background location policy and battery-safe updates
- Proof-of-delivery photo / OTP
- Pickup/drop geofence validation
- Incentive engine
- Payout batching and reconciliation
- KYC uploads and delivery-partner agreements
