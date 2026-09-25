# AasPass Block 18 — Operations Automation

## Unified fulfillment automation

The backend now runs a database-backed operations worker every 30 seconds.

- Expired delivery offers are closed and the delivery partner is returned to `AVAILABLE`.
- Delivery offer history is stored in `delivery_assignment_offers`.
- Orders in `READY_FOR_PICKUP` without an active assignment are retried through the real nearest-partner dispatch engine.
- Delivery offers have a 90-second expiry window.
- Successful dispatch continues through the existing order-event and notification services.

## SLA engine

`order_sla_policies` stores configurable thresholds for the operational order states. `order_sla_breaches` records each breach and prevents repeated notifications inside the notification window.

Current default thresholds are operational defaults only and can be changed from the API:

- Paid / COD confirmed: 10 minutes
- Vendor accepted: 15 minutes
- Preparing: 20 minutes
- Ready for pickup: 10 minutes
- Delivery assigned: 15 minutes
- Picked up: 10 minutes
- Out for delivery: 45 minutes

A breach creates an order event and customer/vendor alerts through the real notification service.

## Refund workflow

Admin/finance users can request refunds through `/admin/operations/refunds`.

- Refund requests are persisted first.
- Cashfree is called server-side when credentials are configured.
- Cashfree's provider status is recorded.
- An internal refund is marked processed only when the provider returns success.
- Payment/order status is finalized only after provider success.
- No client-side or UI-only refund success state is created.

Cashfree's current API exposes `POST /orders/{order_id}/refunds` and supports refund IDs and refund speed; AasPass uses the configured API version and server credentials.

## RBAC governance

People management now supports audited role changes through `user_role_history`.

Self-downgrade is blocked. Every role mutation records the previous role, new role, actor and reason.

## Admin HQ

Operations now exposes:

- Live SLA breaches
- Refund queue
- Manual automation run
- Provider-backed refund action from the order drawer
- People role controls

## Validation

The backend source passed syntax, import and structure audits. Full dependency-based TypeScript compilation still requires installing the project dependencies, and Flutter APK compilation still requires the Flutter SDK.
