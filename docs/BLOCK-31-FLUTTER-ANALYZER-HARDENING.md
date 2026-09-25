# Block 31 — Flutter Analyzer Hardening

This block addresses the concrete issues reported by the Customer app `flutter analyze` run.

## Fixed

- `geocoding` 5.0 breaking API: reverse geocoding now uses a `Geocoding` instance.
- Home screen parser cascade around conditional slivers.
- Deprecated `SwitchListTile.activeColor` usage.
- Deprecated `RadioListTile.groupValue/onChanged` usage through `RadioGroup`.
- Unnecessary `is List` checks where API methods already return typed lists.
- `setState(() => { ... })` set-literal misuse.
- Multiple-underscore callback parameters.
- Unused theme imports.
- Control-flow brace lint findings.
- Null-aware element warning in the app root.

## Validation boundary

The source was repaired against the supplied analyzer output and current Flutter/geocoding API documentation. The development container does not have the Flutter SDK installed, so a local `flutter analyze` execution cannot be truthfully claimed here.

After extraction, run:

```powershell
cd apps\customer
flutter clean
flutter pub get
flutter analyze
```
