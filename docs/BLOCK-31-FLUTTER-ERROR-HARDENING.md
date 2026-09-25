# Block 31 — Customer Flutter Error Hardening

This block is a compile-error hardening pass based on the Flutter analyzer output captured from the Customer app.

## Fixed source-level analyzer errors

- `location_service.dart`: explicit `Placemark` list typing and null-safe reverse-geocoding handling.
- `cart_screen.dart`: restored the missing `models/domain.dart` import for `CartLine`.
- `categories_screen.dart`: repaired the malformed widget tree/closing delimiters.
- `checkout_screen.dart`: rebuilt the malformed generated widget tree while retaining the real checkout, wallet, promotion, membership, Cashfree and provider-confirmation flows.
- `home_screen.dart`: restored the domain-model import, fixed StoreScreen's required `vendorId`, and repaired the offers rail widget tree.
- `onboarding_screen.dart`: `AppTokens.line` is now defined.
- `account_features.dart`: rebuilt malformed generated account-feature widget trees without removing wishlist, shopping lists, reviews, saved payments, gift cards, or security functionality.
- `profile_screen.dart`: rebuilt the malformed account/profile widget tree while retaining the BigBasket-inspired account layout and live backend flows.

## Validation boundary

The development container does not include the Flutter SDK, so a native `flutter analyze`/APK build cannot be truthfully reported from this environment. The source package is structured for direct extraction into the existing AasPass root. Run `flutter pub get` followed by `flutter analyze` in `apps/customer` on the development machine for the authoritative SDK-level analyzer result.
