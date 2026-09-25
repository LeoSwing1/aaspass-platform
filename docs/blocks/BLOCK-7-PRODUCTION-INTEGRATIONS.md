# Block 7 — Production Integrations

## Status
Foundation executed in v1.7.

## Implemented
- Cashfree server-side order creation adapter
- Server-side payment status query adapter
- Cashfree webhook signature verification using raw request body
- Payment webhook idempotency table
- Server-side order amount principle
- Protected integration-status endpoint
- Device-token registration endpoint for FCM-ready notifications
- Serviceability endpoint with configurable pilot zone and Haversine fallback
- Integration health/configuration reporting for Cashfree, Maps, FCM, KYC and Storage
- Server-side secrets boundary: no payment/KYC/storage secrets in Flutter apps

## Provider notes
Cashfree checkout is created server-side and returns a payment session for the client. Webhook signatures must be verified before financial side effects. Cashfree also recommends server-side payment verification after the mobile/web callback.

## Next hardening
1. Add Cashfree marketplace split/settlement flow after commercial/provider onboarding.
2. Add verified refund lifecycle.
3. Add Google Routes API as the optional routing provider.
4. Add Firebase Admin transport for actual push delivery.
5. Add KYC and object-storage providers after contracts/credentials are provisioned.
