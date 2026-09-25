# Transaction Integrity Architecture

AasPass uses the database as the operational source of truth.

### Money boundaries
- Vendor product value: vendor settlement layer
- Delivery fee/earning: delivery settlement layer
- AasPass platform fee: platform revenue ledger
- Platform GST: GST liability ledger
- Payment processing: provider cost layer

The full customer checkout total is not treated as AasPass revenue.

### Idempotency
- Customer order creation accepts an idempotency key.
- Payment webhooks use provider + event key uniqueness.
- Platform fee and GST ledger postings use deterministic idempotency keys.

### Fulfillment
The order state is advanced only through valid server-side transitions. Vendor readiness triggers dispatch. Delivery status changes require assignment ownership and, for pickup/drop, the correct OTP.

### Recovery
Pending notifications are claimable with `FOR UPDATE SKIP LOCKED`. Payment webhook events keep processing state and errors. Pending refunds remain explicitly visible to Finance/Admin until an approved provider flow processes them.
