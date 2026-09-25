# AasPass Customer App — v2.7

This folder is the clean Flutter customer app replacement for the previous error-filled customer implementation.

## Important
This release is a UI/structure hardening pass. Existing AasPass API route shapes and the ₹1 platform-fee presentation are preserved. Server calculations remain authoritative.

## Run locally

If this folder does not contain generated Flutter platform folders on your machine, run once from this directory:

```bash
flutter create .
flutter pub get
flutter run --dart-define=AASPASS_API_BASE_URL=http://10.0.2.2:4100/api/v1
```

For a physical Android device, replace `10.0.2.2` with the reachable host IP of the development machine.

Development OTP remains `270303` in the debug flow. Disable any development-only authentication path before production.

## UI goals
- BigBasket-inspired commerce hierarchy without copying BigBasket branding/assets.
- Safe layouts for narrow screens and larger text.
- 48dp minimum interactive targets.
- Lazy horizontal product/vendor rails.
- Responsive category grid.
- Splash on cold start and after returning from background for >=2 seconds.
- Location permission recovery with app/location settings actions.

## Native permissions
See `docs/LOCATION_PERMISSIONS.md` at the master root.

## v3.1 permission / UX note
Location permission is requested contextually and has an OS-settings recovery path. See `../../docs/native/LOCATION_PERMISSIONS.md` from the repository root.

## Live checkout
The customer app uses `flutter_cashfree_pg_sdk` for online payment checkout. Build with `--dart-define=AASPASS_CASHFREE_ENV=SANDBOX` for sandbox or `PRODUCTION` for production. The Cashfree client credentials are never stored in Flutter; the backend creates the payment session.

## Authentication connection troubleshooting

The customer app does not fake a successful sign-in. The development OTP is accepted only by the backend development-auth route. Before testing Verify & continue, make sure the backend is running and reachable:

- Android emulator + backend on the same Windows machine: `http://10.0.2.2:4100/api/v1`
- Windows/macOS/Linux desktop + local backend: `http://127.0.0.1:4100/api/v1`
- Physical Android device: use the host machine's LAN IP, for example `http://192.168.1.20:4100/api/v1`

Override the base URL with `--dart-define=AASPASS_API_BASE_URL=...` when needed. If the backend is deployed with `NODE_ENV=production`, `/api/v1/auth/dev/login` intentionally returns 404; use a development backend for the development OTP flow or implement a real production OTP provider before enabling production login.
