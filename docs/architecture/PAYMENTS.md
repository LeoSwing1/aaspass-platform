# AasPass Payment Architecture

## Customer payment
1. Backend calculates the authoritative order total.
2. Backend creates the Cashfree order/session.
3. Customer app launches provider checkout using the payment session.
4. Cashfree callback/webhook is treated as untrusted until verified.
5. Backend verifies the webhook signature and persists the event idempotently.
6. Backend verifies gateway payment state before fulfilment/ledger side effects.

## Marketplace settlement
Vendor and delivery-partner funds are not AasPass revenue. The production settlement implementation must use the approved marketplace/split settlement product and contractual structure selected during payment-provider onboarding.

## Secrets
Cashfree credentials, webhook secrets, Maps server keys, FCM service-account credentials, KYC credentials and storage credentials remain server-side only.
