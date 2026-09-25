# AasPass Connectivity Audit — v2.1

## Shared architecture
Customer, vendor, delivery partner, support and admin surfaces share the same versioned backend and PostgreSQL data model.

## New v2.1 connections
- Customer profile updates → `customer_profiles` / `users`.
- Customer address CRUD → `addresses`.
- Customer notification preferences → `customer_notification_preferences`.
- Pilot configuration → `platform_settings`.
- City rollout → `market_launches`.
- Vendor readiness → `vendor_activation_checks`.
- Admin Operations UI → `/api/v1/admin/operations/overview`.

## Security checks
- Operations reads require authentication + `VIEW_DASHBOARD`.
- Operations mutations require `MANAGE_SYSTEM_CONFIG`.
- Customer profile/address changes are scoped to the authenticated customer.
- Changes are audit logged.

## Known environment-dependent checks
Full dependency-backed build, database migration execution and real payment/KYC provider validation require the development environment credentials/toolchains. This audit does not claim those runtime checks occurred here.
