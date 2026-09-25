# Release archive layout

This release ZIP intentionally contains exactly one top-level folder:

`AasPass-Master-v2.7/`

Extracting the ZIP next to the old master gives one replacement folder. Do not copy individual `apps`, `backend`, or `database` folders from the ZIP into unrelated locations.

For the Customer Flutter app, if you already have generated `android/`, `ios/`, `web/`, or `macos/` platform folders from `flutter create .`, preserve them when merging the updated source. If you replace the entire customer folder and those platform folders are absent, run `flutter create .` once before `flutter pub get`.
