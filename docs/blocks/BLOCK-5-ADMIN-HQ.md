# Block 5 — AasPass HQ / Super Admin

Status: **Executed foundation v1.5**

## Scope
Central command center for AasPass: overview, orders, vendors, customers, delivery, finance, support, growth, people/RBAC, settings.

## Design principle
Admin is not a separate source of truth. It reads from the shared AasPass backend, PostgreSQL data model, RBAC layer, order state machine and ledger.

## Implemented
- AasPass HQ dashboard
- Founder/Super Admin identity surface
- KPI and network-health cards
- Orders table
- Vendors table
- Customers table
- Delivery network table
- Finance control board
- Growth targets
- People/RBAC view
- System configuration view
- API summary endpoint with DB + safe demo fallback
- Admin order/vendor/customer/delivery endpoints

## Security
All admin routes remain protected by authentication and `VIEW_DASHBOARD` permission. Deeper actions must be gated by narrower permissions and audited. API-level RBAC remains mandatory.

## Financial controls
The HQ UI deliberately distinguishes:
- AasPass platform fee revenue
- platform GST tracked separately
- vendor funds
- delivery partner funds
- gross checkout flow

No UI label should describe vendor/delivery funds as AasPass revenue.

## Next increment
- Admin CRUD actions
- vendor KYC review queue
- city/area/locality/zone manager
- settlement batch review + approval
- refund approval workflow
- fraud/risk console
- notification center
- analytics drill-down
