# AasPass Integration Boundary

## Rule
Provider secrets never enter customer/vendor/delivery apps. The backend is the only component allowed to create payment sessions, verify webhooks and perform privileged provider calls.

## Current integration boundaries
- Payments: Cashfree adapter
- Maps: configurable Haversine fallback; Google Routes adapter boundary
- Notifications: FCM token registration + provider boundary
- KYC: provider adapter placeholder
- Storage: provider adapter placeholder

## Payment flow
Customer → AasPass backend creates authoritative order → backend creates provider order/session → client launches checkout → provider callback/webhook → backend verifies → backend updates payment/order/ledger state.
