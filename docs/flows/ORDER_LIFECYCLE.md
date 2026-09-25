# AasPass Order Lifecycle

```text
DRAFT
  ↓
PLACED
  ↓
PAYMENT_PENDING ──────→ PAYMENT_FAILED
  ↓
PAID / COD_CONFIRMED
  ↓
VENDOR_ACCEPTED
  ↓
PREPARING
  ↓
READY_FOR_PICKUP
  ↓
DELIVERY_ASSIGNED
  ↓
PICKED_UP
  ↓
OUT_FOR_DELIVERY
  ↓
DELIVERED
```

Cancellation/refund transitions are policy-controlled and must be implemented server-side.

Every transition records:
- actor
- timestamp
- previous state
- new state
- order id
- reason/code
- audit metadata
