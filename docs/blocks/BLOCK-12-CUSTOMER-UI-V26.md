# Block 12 — Customer UI v2.6

## Visible UI changes
- BigBasket-inspired hierarchy: location, large search, quick-search chips, six rotating promotional banners, image-backed category rail, nearby stores, local-pick strip, popular dishes and multiple product grids.
- Nearby store cards show rating, distance, ETA, locality, open state and share.
- Category tiles are image-backed where a local catalog image exists and use responsive grid sizing.
- Product cards use a fixed media region and bottom-anchored pricing/action row so long names do not push the ADD control outside the card.
- Category screen is responsive and uses a larger safe card extent to avoid the reported 14px bottom overflow.
- Checkout uses a dedicated visual hierarchy for address, payment, local offer, order summary and a sticky total-to-pay bar.
- Six banner slides animate automatically with page indicators.
- Existing lifecycle splash overlay remains on cold start and returns after the app has been backgrounded long enough to satisfy the resume threshold.

## Location handling
- Runtime states are handled for service disabled, denied, permanently denied and successful coordinates.
- A blocked-permission state opens OS app settings instead of repeatedly requesting a permission that the OS will not show.
- Native Android/iOS declaration requirements are documented in `docs/native/LOCATION_PERMISSIONS.md`.

## Catalog expansion
- Added eight additional local-style products to the customer demo catalog for richer visual density.
