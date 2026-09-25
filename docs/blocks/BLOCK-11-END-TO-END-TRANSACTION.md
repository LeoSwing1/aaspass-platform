# AasPass Block 11 — End-to-End Transaction Integrity

## Objective
Turn the shared AasPass architecture into one consistent marketplace transaction loop from checkout through fulfillment, customer tracking, support and finance visibility.

## Implemented
- Server-side recognition of AasPass platform fee and platform GST only when payment is confirmed (or COD is confirmed), with idempotent ledger entries.
- Delivery dispatch engine that finds a verified available partner near the vendor using locked candidate rows.
- Delivery assignment state flow: OFFERED → ACCEPTED → PICKED_UP → OUT_FOR_DELIVERY → DELIVERED.
- Pickup and drop OTPs with attempt limits; OTPs stored as salted hashes for verification and encrypted ciphertext for authorized reveal.
- Customer delivery-code endpoint and vendor/delivery pickup-code endpoints with ownership checks.
- Customer order timeline and live tracking endpoints.
- Customer cancellation flow with stock reservation release; paid orders move to REFUND_PENDING and create a refund record for downstream provider processing.
- Admin finance reconciliation endpoint for payment amount mismatches and pending refunds.
- Vendor role permission fix: vendor users can manage only their own order transitions through `MANAGE_OWN_ORDERS`.
- Background notification dispatcher started by the API process when database-backed notifications are enabled.
- Delivery proof endpoint for pickup/drop evidence.

## Transaction path
Customer checkout → order record → payment/COD → verified payment event → vendor queue → vendor acceptance/preparation → ready for pickup → automatic delivery offer → partner acceptance → OTP pickup → out-for-delivery → OTP drop → delivered → notifications → admin reconciliation.

## Security notes
- No payment secrets are stored in Flutter.
- Ledger revenue is idempotent.
- Delivery assignment claiming is protected by row locks.
- Delivery OTP verification is capped at 5 attempts per stage.
- Customer/vendor/partner access is ownership-scoped.
- Refund initiation is separated from actual payment-provider refund execution.

## Not production-activated
Provider credentials, real marketplace settlement commercial configuration, KYC provider onboarding, and production refund execution remain deployment/compliance tasks.
