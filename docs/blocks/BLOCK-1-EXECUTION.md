# Block 1 — Core Platform Foundation

Status: EXECUTED

## Delivered
- Central PostgreSQL schema for identity, addresses, service zones, users, vendors, vendor plans, KYC, subscriptions, categories, products, inventory, carts, orders, payments, ledger, delivery, support, notifications, device tokens and audit logs.
- API-level authentication middleware and centralized role permissions.
- Development-only OTP login using the agreed development OTP `270303`; unavailable automatically in production.
- Signed access-token foundation.
- Centralized AasPass business configuration.
- Protected `/api/v1/me` route.
- Role-protected `/api/v1/admin/summary` route.
- `/api/v1/roles` permission catalog for app clients.
- Local PostgreSQL + Redis stack.
- INR/paise money convention.
- Initial vendor plans and commerce categories.

## Exit criteria
- Source has no known syntax errors in the authored TypeScript.
- Fresh DB initialization is defined by schema + seed.
- Missing/invalid bearer tokens are rejected.
- Insufficient roles are rejected with 403.
- Development auth route is unavailable in production.

## Deliberate later work
Production OTP/Firebase identity, production Cashfree credentials, marketplace settlement contracts, KYC vendor, maps, push/SMS/WhatsApp providers, final tax/legal rules, queues/workers and rate limiting belong to later integration/reliability blocks.
