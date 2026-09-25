# AasPass Block 9 — Pilot & Scale Operations

## Objective
Turn the shared AasPass platform into an operational control system for a locality pilot and the path to the founder's Year-1 target of 10,000 vendors.

## Locked founder targets
- Year-1 vendor target: 10,000
- Minimum target order density: 100 orders/vendor/day
- Implied target at full Year-1 achievement: 1,000,000 orders/day
- Customer platform fee: ₹1/order plus applicable tax handling
- Minimum vendor subscription: ₹199/month

These are management targets, not external forecasts.

## Delivered
- Platform settings for pilot targets and stage.
- Market launch records for city-by-city rollout.
- Vendor activation readiness checklist.
- Customer notification preference storage.
- Admin Operations dashboard API.
- Admin UI for pilot/scale control room.
- Expansion gate metrics for catalog and KYC readiness.

## Expansion gates
A city should not be considered ready for expansion using vendor registrations alone. Review:
1. Active vendors.
2. Catalog readiness.
3. KYC readiness.
4. Serviceability/zone readiness.
5. Delivery partner availability.
6. Active-order load.
7. Support workload.
8. Actual order density and repeat behavior.

## API surface
- `GET /api/v1/admin/operations/overview`
- `POST /api/v1/admin/operations/launches`
- `PATCH /api/v1/admin/operations/settings`

Write access is restricted by `MANAGE_SYSTEM_CONFIG`.
