# AasPass Block 29 — Unified Operations & Reconciliation

## Implemented
- Unified Admin Command Center API combining active orders, dispatch state, SLA breaches, provider webhook activity, reconciliation runs, and durable integration events.
- Live operational event stream endpoint backed by `integration_outbox`.
- Finance reconciliation comparing order platform fee/GST expectations against posted ledger credits.
- Cashfree payment reconciliation for unresolved provider payments with amount-mismatch detection and provider-status synchronization.
- Reconciliation run/item tables with immutable run history.
- Automatic five-minute reconciliation worker; Cashfree reconciliation runs only when the provider is configured.
- Admin UI Command Center with operational queue, event feed, and manual reconciliation controls.
- Duplicate integration-event publication removed from order events.

## Production behavior
Provider reconciliation never fabricates payment success. Amount mismatches are recorded as reconciliation mismatches and are not silently promoted to paid.
