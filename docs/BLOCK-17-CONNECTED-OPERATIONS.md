# AasPass Block 17 — Connected Operations Command Center

This block extends the AasPass ecosystem so operational actions travel through the same PostgreSQL-backed identity, audit and notification services used by the customer/vendor/delivery applications.

## Admin HQ

- Live customer, vendor, order, delivery, support, finance, operations and audit sections.
- Customer ID (`AAS-CUS-######`) is the cross-surface identifier.
- Customer drawer loads profile, addresses, orders and support history from the API.
- Admin can activate/deactivate a customer account through the API.
- Admin can queue a customer notification through the notification service.
- Order drawer loads items, payments, delivery assignment and order events.
- Order status changes are audited and create an order event.
- Vendor drawer supports status and KYC actions.
- Audit section reads the real `audit_logs` table.
- User status changes are audited and self-disable is blocked.

## Support Console

- Customer 360 lookup by Customer ID or registered mobile.
- Ticket queue remains database-backed.
- Support replies create real ticket messages and customer notifications.
- Support leads can load active support agents and route tickets to an agent.
- Ticket routing is persisted in `support_tickets.assigned_to` and audited.

## Notification path

Administrative/customer-facing notifications use `queueNotification()` rather than inserting notification rows directly. This preserves customer notification preferences and allows FCM/WhatsApp adapters and the background dispatcher to deliver the notification when configured.

## Development authentication safety

The development OTP endpoint remains development-only and is disabled in production. A development phone that is already assigned to one role cannot be silently re-provisioned as another role; separate test accounts are required for different surfaces.

## Validation

- Backend TypeScript syntax: PASS.
- Relative import audit: PASS.
- Structure audit: PASS.
- Admin/support TSX checked with a local TypeScript syntax/type stub because package dependencies are not installed in this environment.
- Flutter APK build not claimed because the Flutter SDK is not installed in the build environment.
