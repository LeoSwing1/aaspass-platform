# AasPass Delivery Partner App

Block 4 implementation for the shared AasPass platform.

## Screens / flows
- Availability: offline / available
- Nearby jobs with distance and estimated earnings
- Assignment accept
- Earnings dashboard
- Profile / KYC / safety references
- Device geolocation permission flow
- API-backed status, location, jobs and earnings

## Run

```powershell
flutter create .
flutter pub get
flutter run --dart-define=AASPASS_API_BASE_URL=http://10.0.2.2:4100/api/v1
```

The debug API can fall back to demo responses when `DATABASE_URL` is absent. Production should use authenticated sessions and the real PostgreSQL-backed API.

## v3.1 permission / UX note
Location permission is requested contextually and has an OS-settings recovery path. See `../../docs/native/LOCATION_PERMISSIONS.md` from the repository root.
