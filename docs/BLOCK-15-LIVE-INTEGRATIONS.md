# Block 15 — Live integrations + reference UI

## What changed

### Customer
- API-first catalog: categories, vendors, products, search, Smart Basket/Top Picks, store pages and orders now read the shared backend.
- Server cart synchronization on add/decrement/clear/restore. Checkout uses the backend cart instead of trusting a local-only cart.
- Checkout creates a real order with a real saved address and idempotency key.
- Online checkout starts a Cashfree payment session on the backend and opens the Cashfree Flutter Web Checkout SDK. The UI only shows payment confirmation after the backend/provider status is checked.
- COD is recorded through the real order/payment ledger path.
- Saved addresses and support tickets now persist through backend APIs.
- Location permission is requested contextually on the customer Home surface; serviceability is checked against the database zones.
- Added the reference-inspired animated lime-to-white melt header and branded basket loading screen.

### Vendor
- Removed the local/mock dashboard, order queue and catalog.
- Vendor Home, Orders, Catalog and Store surfaces are backed by `/vendor/*` APIs.
- Store open/closed state is persisted.
- Store location is persisted to the vendor record.
- Product availability, stock and product creation update the database.
- Login no longer silently creates a fake token when the backend is unavailable.

### Delivery partner
- Removed demo profile/jobs/earnings fallback data.
- Delivery app uses `/delivery/*` APIs for profile, jobs, status, assignment acceptance, assignment transitions and earnings.
- Current location is written to the backend and refreshed while the partner is online.
- Login no longer silently creates a fake token when the backend is unavailable.

### Backend hardening
- `DATABASE_URL` is mandatory; operational APIs no longer return synthetic no-database payloads.
- Added vendor store-status and location endpoints.
- Vendor product update supports `isActive` and persists it.
- Customer vendor/product search query parameters are now actually applied by SQL.
- Customer order creation accepts `Idempotency-Key` as a header as well as the request body.

## Native setup required before device build

The repository deliberately does not commit generated Flutter `android/` and `ios/` folders. After running `flutter create .` inside each app (or restoring the platform folders from the deployment project), keep these native declarations:

### Customer Android
```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
```

### Customer iOS
```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>AasPass uses your location to find nearby stores and calculate delivery availability.</string>
```

Cashfree's current Flutter package is `flutter_cashfree_pg_sdk` and its current package documentation provides `CFSession` / `CFPaymentGatewayService` based payment-session checkout. The customer app is wired to that flow; provider credentials remain server-side only.

## Provider configuration

Backend `.env` must contain a real PostgreSQL `DATABASE_URL`. For online payments configure:

- `CASHFREE_MODE=sandbox` or `production`
- `CASHFREE_CLIENT_ID`
- `CASHFREE_CLIENT_SECRET`
- `CASHFREE_API_VERSION`
- a public HTTPS webhook endpoint routed to `/api/v1/integrations/payments/webhook`

For production push/WhatsApp/storage/KYC, configure their provider credentials before enabling those channels. The code must fail visibly when a provider is not configured rather than pretending the operation succeeded.
