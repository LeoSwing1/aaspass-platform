## v3.25 — Local PostgreSQL SSL configuration hardening

- Fixed environment boolean parsing so `DATABASE_SSL=false` is actually false instead of JavaScript-coerced true.
- Applied explicit boolean parsing to backend environment flags.
- Added local environment/SSL troubleshooting documentation.

## v3.24

- Fixed backend `.env` loading using Node 22 native `loadEnvFile()` before Zod validation.
- Removed duplicate operational-alert worker import found during startup hardening.

## v3.23 — Cashfree webhook parser startup fix

- Added the missing `parseCashfreePaymentEvent` export used by the payment webhook route.
- Normalizes Cashfree payment webhook payloads into order ID, payment status, amount, and provider payment ID.
- Supports nested Cashfree `data.order` / `data.payment` payloads plus top-level compatibility fields.
- Keeps payment processing provider-backed; no synthetic payment success was added.

## v3.21 — Customer authentication connectivity hardening

- Made the customer API base URL platform-aware for local development.
- Kept `AASPASS_API_BASE_URL` as the explicit override for emulator, physical-device, staging, and production environments.
- Replaced the generic authentication failure toast with actionable server/network diagnostics.
- Preserved the real backend-only development authentication flow; no fake successful login was added.

## v3.20 — Customer Flutter analyzer hardening

- Fixed geocoding 5.0 API migration by using `Geocoding().placemarkFromCoordinates`.
- Fixed the Customer Home widget-tree parse cascade by replacing collection-condition-heavy rendering with an explicit sliver list.
- Fixed Flutter analyzer warnings for deprecated wallet/payment controls by migrating to `activeThumbColor` and `RadioGroup`.
- Fixed unnecessary type checks in notifications/orders.
- Fixed malformed `setState(() => {...})` set-literal usage in store/address flows.
- Removed unused theme imports and cleaned callback parameter lint warnings.
- Preserved all existing Customer account, commerce, loyalty, membership, checkout, location, and operations integrations.

## v3.11 / Block 24 — Customer Account Commerce

- Added PostgreSQL-backed wishlist and shopping-list APIs.
- Added delivered-order product ratings and reviews with vendor aggregate recalculation.
- Added provider-reference-only saved payment method reads.
- Added admin-issued gift cards with hashed codes and transactional Wallet redemption.
- Added customer session visibility and revoke-other-sessions security controls.
- Added Customer Flutter screens for Wishlist, Shopping Lists, Ratings & Reviews, Saved Payments, Gift Cards, and Privacy & Security.

# v3.10 — Customer My Account / Profile UX

- Rebuilt customer profile screen from the supplied BigBasket-style reference.
- Connected live customer identity, profile editing, wallet, orders, addresses, rewards, notifications and logout.
- Added authenticated notification-preference controls.
- Added real account logout state transition.
- Kept unsupported wishlist/shopping-list/saved-payment/review/gift-card areas from fabricating data.

## v3.7 — Block 20 — Transactional Commerce

- Connected wallet and promotion systems to server-side checkout.
- Added atomic inventory reservation lifecycle and payment-failure release.
- Added wallet-aware refunds and Cashfree provider refund split.
- Added admin inventory control visibility.
- Added customer checkout coupon/wallet controls and profile wallet visibility.

# v3.6.0 — Block 19 Commerce Control Plane

- Added vendor onboarding readiness and service-zone governance.
- Added delivery partner KYC onboarding events.
- Added customer wallet accounts and auditable wallet transactions.
- Added promotion campaigns and server-side customer promotion validation.
- Added vendor and delivery settlement generation with explicit PENDING payout state.
- Added risk flag storage, behavioral scanning and review lifecycle.
- Added Admin HQ Control Plane data surface.
- Added customer API methods for wallet and promotion services.
- Preserved the no-fake-success rule: payout records are not marked paid without a configured payout provider.


## v3.6 — Block 19 Commerce Control Plane

Vendor onboarding, service-zone governance, wallets, promotions, settlements and risk controls are now database-backed.
# v3.5.0 — Block 18 Operations Automation

- Added automated delivery-offer expiry and retry dispatch.
- Added delivery assignment offer history and 90-second offer expiry.
- Added configurable order SLA policies and breach tracking.
- Added background SLA notifications and operational escalation events.
- Added server-side Cashfree refund initiation and provider-backed refund state handling.
- Added audited user role governance and self-downgrade protection.
- Expanded Admin HQ with SLA, refund and automation controls.
- Added Block 18 operations automation documentation.

# v3.4.0 — Block 17 Connected Operations

- Expanded Admin HQ with live record drawers for orders, customers, vendors and support.
- Added customer notification action, admin audit view and user status control.
- Added support-agent routing for support leads.
- Routed administrative notifications through the real notification service and customer preferences.
- Hardened development authentication against cross-role phone re-provisioning.
- Added Block 17 connected operations documentation.

# AasPass Master v3.3 — Block 16

- Connected Admin HQ to live PostgreSQL-backed orders, vendors, customers, delivery, finance, support, people, operations and settings data.
- Removed Admin HQ seeded/demo dashboard data and added authenticated admin sessions.
- Added Admin order detail/status control with audit trail and order-event notifications.
- Added Customer 360 admin lookup using stable AAS-CUS customer IDs.
- Added Customer ID/phone lookup to Support and removed Support seeded tickets.
- Added support reply/status notifications to customers.
- Removed customer app offline fake token/customer ID fallback.
- Added connected ecosystem documentation.

## v3.2 — Block 15
- Removed application-side synthetic/mock data fallbacks from customer, vendor and delivery operational flows.
- Connected customer catalog/search/cart/address/support/order/payment flows to backend APIs.
- Added Cashfree Flutter checkout session flow and provider-status verification.
- Added vendor store status/location persistence and live catalog/order surfaces.
- Added delivery location persistence and removed demo job/earnings fallback.
- Added animated melt header and branded basket loading screen.
- Made DATABASE_URL mandatory for backend operational integrity.

# AasPass Master v2.7

## Customer UI / structure hardening
- Replaced the error-prone customer implementation with a clean modular Flutter customer app.
- Preserved the existing AasPass API route shapes used by the customer client.
- Added responsive commerce home, category grid, product cards, vendor cards, cart, checkout, orders, tracking, profile, notifications, help and address screens.
- Improved location permission recovery with OS settings actions.
- Added BigBasket-inspired hierarchy while keeping AasPass brand assets and copy.
- ZIP contains one top-level master folder for simple replacement/extraction.

## Validation
- Source-level bracket/parenthesis/string checks performed on customer Dart files.
- Import-path audit performed for customer relative imports.
- Flutter SDK is not installed in the build environment, so full `flutter analyze`, `flutter test`, and APK build must be run on the development machine.

## v2.8 — Cross-App UI/UX Block 13
- Rebuilt vendor as Flutter mobile app; previous web version moved to `legacy/vendor-web`.
- Refreshed customer and delivery Flutter visuals without changing business logic.
- Added admin/support visual refinements and shared UI documentation.

## v2.8 — Block 13 UI/UX Final
- Customer Flutter visual refresh.
- Vendor converted to canonical Flutter mobile app and visually rebuilt.
- Delivery Partner Flutter visual rebuild and overflow-safe layouts.
- Support/Admin web visual polish retained.
- Removed legacy vendor web production path.
- Added cross-app UI test checklist.


## v2.9 — Customer Commerce UI Block
- Refined Customer Home into a denser grocery-commerce hierarchy.
- Added a stronger delivery/location header with notification and account actions.
- Preserved existing search, location, API, cart, navigation and store/product flows.
- Added deals-near-you rail while reusing existing product data.
- Refined category/store/product spacing for smaller mobile screens.
- Kept AasPass branding and avoided copying third-party logos, artwork or exact layouts.
- No business rules, pricing calculations, authentication or API contracts were changed.
- Flutter SDK was not available in the packaging environment; Dart/Flutter build validation must be run on the development machine.


## v3.0 — Reference-driven Customer Home UI
- Reworked Customer Home to closely follow the supplied grocery-commerce screenshots' visual hierarchy: lime delivery header, large rounded search, shortcut tiles, offer card, promotional hero, category rail, nearby stores and product rails.
- Preserved AasPass branding and existing API/cart/location/product/vendor contracts.
- Did not import third-party logos or proprietary artwork from the reference screenshots.
- Flutter analyze/test/APK build not run in this environment.


## v3.1 — Location + Reference Navigation Hardening
- Customer home now requests location on first authenticated entry with an in-app explanation before the OS permission prompt.
- Customer location state is visible in the delivery header and can be retried directly from the header.
- Customer navigation now follows the supplied reference direction with three primary tabs: Home, Categories, Top picks.
- Cart and Orders remain directly accessible from the customer home header.
- Added a Smart Basket / Top picks customer surface with compact product discovery.
- Vendor location flow now explicitly requests permission and provides settings recovery instead of silently failing.
- Delivery Partner location flow now explicitly requests permission and provides settings recovery instead of silently failing.
- Vendor and Delivery Partner surfaces continue using the same AasPass visual language and shared backend contracts.
- Generated Android/iOS folders remain excluded from the source package; native permission declarations are documented in `docs/native/LOCATION_PERMISSIONS.md`.
- Flutter analyze/test/APK build still requires the Flutter SDK on the development machine.

## v3.13 — Block 26: Personalized Commerce Engine
- Added database-derived customer personalized feed endpoint.
- Added Buy Again and Recently Bought surfaces to Customer Home.
- Added category-based recommendations excluding products already purchased.
- Added live eligible offers ranked against customer order history.
- Added 30-day AOV and repeat-customer analytics to Admin Control Plane.
- Added migration 016 for personalized commerce query indexes.
- Preserved authoritative checkout validation; feed offers never grant discounts by themselves.

## v3.14 — Block 27
- Added PostgreSQL-backed AasPass Plus membership lifecycle and provider-state handling.
- Added targeted campaign eligibility and server-side checkout enforcement.
- Added customer membership visibility and provider-boundary UX.
- Connected checkout UI to the authoritative backend quote for membership savings.
- Added vendor growth analytics and Admin membership/campaign metrics.
- Added migration `017-membership-campaigns-analytics.sql`.

## v3.18 — Flutter Error Repair / Root Package
- Repaired missing Customer `AasPassApi` account methods used by the BigBasket-style My Account screens.
- Restored the missing Customer onboarding implementation referenced by `main.dart`.
- Added Flutter contract audit tooling.
- Added per-app Flutter analysis options.
- Packaged the release as a flat root archive so `apps/`, `backend/`, `database/`, `packages/`, `tools/`, and `docs/` extract directly into the project root.
