# Block 12 — Customer UI Hardening & Local Discovery

## Scope executed
- Fixed category-grid overflow by replacing ratio-only sizing with fixed `mainAxisExtent`.
- Fixed product-card overflow using a fixed grid extent and a flexible image area.
- Added native location recovery UX for disabled services and permanently denied permissions.
- Added native reverse geocoding with graceful fallback.
- Added four local AasPass promotional banners with auto-advance and animated scale.
- Added expanded nearby store inventory and store artwork.
- Added product artwork and popular product badges.
- Added most-popular-dishes rail.
- Upgraded search with quick intent chips.
- Upgraded vendor cards with image, status, rating, distance, ETA and share.
- Upgraded notification center with API-first/fallback behavior.
- Upgraded checkout visual hierarchy and bottom CTA.
- Added app-level splash overlay at cold launch and after returning from background for more than two seconds.

## Design reference
Customer UX takes inspiration from high-performing grocery-commerce patterns such as prominent location/search, category discovery, product grids and dense shopping cards. It is not a copy of any third-party interface.

## Native permissions
See `apps/customer/README.md`.

## Validation
Flutter/Dart SDK is not installed in the build container, so source-level delimiter and asset checks are used here. The app must still be run with `flutter analyze`, `flutter test`, and `flutter run` on the development machine after native platform configuration is present.
