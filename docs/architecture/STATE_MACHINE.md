# AasPass Order State Machine — Block 1 foundation

`DRAFT → PLACED → PAYMENT_PENDING → PAID/COD_CONFIRMED → VENDOR_ACCEPTED → PREPARING → READY_FOR_PICKUP → DELIVERY_ASSIGNED → PICKED_UP → OUT_FOR_DELIVERY → DELIVERED`

Exceptional/terminal states include `PAYMENT_FAILED`, `CANCELLED`, `REFUND_PENDING`, and `REFUNDED`.

Only the backend can authorize state transitions.
