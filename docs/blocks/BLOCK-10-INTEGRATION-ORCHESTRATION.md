# AasPass Block 10 — Integration Orchestration

## Purpose
Connect payments, maps, notifications and order events to one source of truth so the customer, vendor, delivery, support and admin surfaces receive consistent state.

## Implemented
- Cashfree webhook verification, idempotent event persistence, payment-status normalization and server-side amount checking.
- Payment webhooks now update payment/order state and emit order events.
- `order_events` history table.
- FCM HTTP v1 push transport with server-side service-account authorization.
- Notification inbox/read state and delivery-attempt tracking.
- WhatsApp transport adapter boundary.
- Admin notification dispatch/test endpoints.
- Google Routes travel mode selection: TWO_WHEELER, DRIVE, BICYCLE, WALK.
- Customer Flutter API methods for device tokens, notifications, payment session/status and route estimates.

## Provider setup required before production
- Cashfree credentials + marketplace/settlement configuration.
- Firebase project + service account.
- Google Routes API key.
- WhatsApp Cloud API phone number ID/access token and message-policy compliant templates where required.
- SMS/KYC/storage providers.

## Official references used
- Firebase FCM HTTP v1: https://firebase.google.com/docs/cloud-messaging/send/v1-api
- Google Routes API Compute Routes: https://developers.google.com/maps/documentation/routes/compute_route_directions
- Cashfree webhook verification: https://www.cashfree.com/devstudio/preview/pg/tools/webhookVerification
- Cashfree payment/session flow: https://www.cashfree.com/devstudio/preview/pg/seamless

## Integrity rules added in this pass
- Payment order/session amount is read from the server-side order record.
- Signed payment webhooks are deduplicated before state mutation.
- Payment events with an amount mismatch are rejected and stored as processing errors.
- Notification dispatch claims pending rows with `FOR UPDATE SKIP LOCKED` to reduce duplicate delivery across workers.
- Delivery assignment events are recorded only after the assignment transaction commits.
- Vendor order notifications are emitted for confirmed/paid orders rather than payment-pending orders.
