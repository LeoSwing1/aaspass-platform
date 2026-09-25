# Block 13 — Cross-App UI/UX Refresh

Scope: UI/UX only. Business rules, API contracts, pricing, authentication semantics, payment flow and permission behavior are not intentionally changed.

## App surfaces
- Customer — Flutter mobile experience
- Vendor — Flutter mobile application (legacy web retained only under `legacy/vendor-web`)
- Delivery Partner — Flutter mobile experience
- Support — web console
- Admin — AasPass HQ web console

## Shared visual language
- AasPass green primary with mint support surface
- white/very-light-gray commerce surfaces
- 12–24dp radii
- 48dp minimum primary controls
- section headers + dense commerce cards
- safe responsive spacing
- original AasPass artwork only

## Customer cues
Commerce-first hierarchy inspired by proven grocery patterns: prominent location, search, category discovery, promo rails, nearby stores, product rails, persistent basket, clear checkout.

## Vendor cues
Mobile-first merchant operations: store state, orders, catalog, inventory, actions, earnings and support without requiring a desktop browser.

## Delivery cues
At-a-glance online state, jobs, earnings, pickup/drop details and profile/safety controls.

## Legacy handling
The previous Next.js vendor UI is retained in `legacy/vendor-web` for reference/rollback only. It is not the production vendor app.
