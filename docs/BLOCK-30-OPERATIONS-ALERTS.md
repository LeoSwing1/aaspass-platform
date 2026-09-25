# Block 30 — Operational Alerts

AasPass now has a persistent operational alert layer across fulfillment, delivery assignment, provider reconciliation, and finance reconciliation.

## Implemented
- `operational_alerts` PostgreSQL table with dedupe and lifecycle state.
- Automatic alerts for stalled vendor orders.
- Automatic alerts for overdue/unassigned delivery.
- Automatic alerts for Cashfree provider reconciliation exceptions.
- Automatic alerts for finance ledger mismatches.
- Targeted push notifications for assigned operational users when a new alert is created.
- Durable `OPERATIONAL_ALERT_CREATED` integration events.
- Admin endpoints to list, acknowledge, resolve, and manually run alert automation.
- 30-second worker integration.

No alert marks a payment/order as successful; alerts are operational controls only.
