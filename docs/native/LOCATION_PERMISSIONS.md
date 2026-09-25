# AasPass Native Permission Contract

## Customer
- On first authenticated entry to the customer home, AasPass shows an in-app explanation and then requests OS location permission.
- The customer can retry from the delivery-location header.
- If permission is permanently denied, AasPass opens App Settings instead of attempting to bypass the OS.

## Vendor
- The vendor app requests location when the merchant shell opens so operating-area discovery can work.
- Denied/permanently denied states expose a recovery action to App Settings.

## Delivery Partner
- The delivery app requests location when the partner shell opens because nearby assignment matching depends on it.
- Denied/permanently denied states expose a recovery action to App Settings.

## Android / iOS native configuration
The Flutter packages are included in the source ZIP, but this repository intentionally does not commit generated `android/` and `ios/` platform folders. When running `flutter create .` for an app, ensure the generated platform configuration contains the required declarations:

Android: `ACCESS_FINE_LOCATION` and `ACCESS_COARSE_LOCATION` in `android/app/src/main/AndroidManifest.xml`.

iOS: `NSLocationWhenInUseUsageDescription` in `ios/Runner/Info.plist` with a clear explanation such as: `AasPass uses your location to show nearby stores and estimate local delivery times.`

Do not request unrelated permissions at startup. Camera, microphone, notifications and media permissions should be requested only when the user enters the feature that needs them (for example voice search, KYC/photo upload, or push notifications).
