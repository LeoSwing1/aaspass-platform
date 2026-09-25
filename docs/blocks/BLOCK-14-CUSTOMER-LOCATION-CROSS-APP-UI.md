# Block 14 — Customer Commerce + Native Permissions + Cross-App Continuity

## Reference interpretation
The supplied screenshots establish the target interaction hierarchy: delivery/location header, large rounded search, shortcut categories, promotional cards, category rails, nearby/trending products, Smart Basket / Top picks, and a compact three-item bottom navigation. AasPass keeps its own brand assets and data while following this hierarchy.

## Customer changes
1. First authenticated Home entry shows an AasPass location explanation and then invokes the OS location permission request.
2. Location is visible in the Home header and can be retried from the header.
3. Cart and Orders are accessible from the Home header.
4. Primary navigation is Home / Categories / Top picks.
5. Added Smart Basket-style Top picks product discovery using existing AasPass product data.

## Vendor continuity
- Vendor remains a Flutter merchant application.
- Location permission is requested explicitly when the merchant shell opens.
- Permanently denied/service-disabled states provide settings recovery.
- Existing order, catalog, store and support flows remain connected to the shared API.

## Delivery continuity
- Delivery Partner remains a Flutter operating application.
- Location permission is requested explicitly when the partner shell opens.
- Location failure is visible and recoverable instead of being silently ignored.
- Existing availability, jobs, earnings and profile flows remain connected to the shared API.

## Native permission gate
The ZIP does not contain generated Android/iOS folders. Before device testing, run `flutter create .` inside each app and apply the required location declarations from `docs/native/LOCATION_PERMISSIONS.md`.

## Validation
- Repository structure audit: PASS.
- Relative import audit: PASS.
- TypeScript/block checks: PASS.
- Flutter analyze/test/APK build: not run because Flutter SDK is not installed in this environment.
