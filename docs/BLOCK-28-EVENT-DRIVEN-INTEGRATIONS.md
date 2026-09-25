# AasPass Block 28 — Event-Driven Integrations

This block adds a durable PostgreSQL integration outbox so domain events are not lost when external integrations or notification processing are temporarily unavailable.

## Implemented
- `integration_outbox` durable event table with retries and dead-letter-style FAILED state.
- Order events publish `ORDER_STATUS_CHANGED` integration events.
- Background worker dispatches pending events every operations cycle.
- Delivered-order integration event can trigger a customer completion notification.
- Membership provider webhook is signature-verified, idempotent and provider-status driven.
- Membership activation publishes `MEMBERSHIP_ACTIVATED`, which queues the customer notification.
- Admin can inspect and manually dispatch the outbox.

## Production boundary
Provider credentials, provider webhook URL configuration and provider-specific event schemas still have to be configured in the deployment environment. The application never fabricates provider confirmation.
