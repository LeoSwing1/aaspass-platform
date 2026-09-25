# Block 31 — Flutter Error Repair & Root Packaging

## What was repaired

This block is a regression/compile-contract repair pass over the Customer Flutter app after the account/profile integrations.

### Customer API contract
Implemented the missing client methods used by `features/profile/account_features.dart`:

- wishlist
- remove wishlist
- shopping lists
- create/delete shopping list
- reviews
- save review
- saved payments
- gift cards
- redeem gift card
- security sessions
- revoke other sessions

These map to the existing authenticated `/api/v1/account/*` backend routes. No backend feature was removed.

### Customer bootstrap
`OnboardingScreen` was referenced from `main.dart` but its implementation/import was missing. A real onboarding screen was restored and connected to the existing persisted `onboarding_done` flag.

### Static contracts
Added `tools/flutter-contract-audit.mjs` to catch:

- Flutter package imports missing from pubspec dependencies
- customer API calls with no corresponding `AasPassApi` method
- missing onboarding implementation when referenced by `main.dart`

### Root packaging
The release archive is intentionally **flat**. Its contents are `apps/`, `backend/`, `database/`, `packages/`, `tools/`, `docs/`, etc. directly at archive root.

Unzip it into the AasPass project root. It does not contain a second `aaspass14/` wrapper directory.

Native Flutter folders that may already exist locally are not deleted by this source archive; only files included in the archive are overwritten when the user chooses to extract/replace them.

## Validation

- TypeScript syntax: 43 files, 0 errors
- TypeScript relative imports: 0 missing
- AasPass structure audit: PASS
- Flutter contract audit: PASS
- Customer package imports: all declared
- Archive integrity: verified after packaging

A full `flutter analyze`/APK build still requires a local Flutter SDK; this environment does not contain the Flutter SDK, so this block does not falsely claim a runtime analyzer result.
