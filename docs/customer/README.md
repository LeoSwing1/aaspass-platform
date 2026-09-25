# Customer App v2.7 UI Hardening

## Screen map
Splash -> Onboarding -> Login/OTP -> Home -> Categories -> Search -> Store -> Cart -> Checkout -> Orders -> Tracking -> Profile -> Addresses -> Notifications -> Help.

## UX constraints
- BigBasket-inspired density and hierarchy; AasPass branding remains original.
- No API/model/auth/pricing business logic was intentionally changed as part of this UI rebuild.
- Platform fee is displayed separately as ₹1; illustrative GST is shown only as a UI fallback label.
- Location failure states always offer a recovery path when permissions are blocked.

## Validation
The execution environment does not include the Flutter SDK, so validate with `flutter analyze`, `flutter test`, and `flutter build apk` on the development machine.
