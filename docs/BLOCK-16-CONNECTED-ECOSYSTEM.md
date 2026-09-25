# AasPass Block 16 — Connected Ecosystem

This block connects the operational surfaces to the same PostgreSQL-backed AasPass source of truth.

## Surfaces

- Customer app: real customer profile, stable `AAS-CUS-######` Customer ID, orders, addresses, cart, notifications and support.
- Vendor app: vendor catalog, store status, location, orders and operational state.
- Delivery app: partner profile, location, availability, assignments and earnings.
- AasPass HQ admin: authenticated command center with live database views for orders, vendors, customers, delivery, finance, support, operations, people and settings.
- AasPass Support: authenticated ticket console with Customer ID/phone Customer 360 lookup, order context, ticket messages, internal notes and status changes.

## Customer ID flow

1. A customer signs in through the backend authentication service.
2. PostgreSQL creates `customer_profiles` automatically for the customer role.
3. The database assigns the immutable-style display identifier `AAS-CUS-######` from `aaspass_customer_code_seq`.
4. The customer app stores the returned code for display and also loads it from `/customer/profile`.
5. Admin and Support can search the same code to open the customer's operational context.

## Operational flow

`Customer → Cart → Order → Payment → Vendor → Delivery → Delivered → Ledger → Notifications → Support/Audit`

Order lifecycle changes are written to `order_events` and customer notifications are queued through the notification service. Support replies/status changes also queue customer notifications.

## Admin and Support authentication

The web portals no longer fall back to seeded/demo records. In development they authenticate through `/auth/dev/login` with the backend-configured development OTP and receive a real signed access token/session. Production continues to reject the development endpoint.

## Important production requirement

Set production authentication, payment, FCM, WhatsApp and public webhook configuration before launch. The development OTP is a backend development mechanism, not a production OTP provider.
