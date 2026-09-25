# Block 32 — Customer Authentication Connectivity Hardening

The screenshot symptom — the development OTP is accepted in the UI, followed by `Could not connect to AasPass` — means the customer client reaches its submit path but the backend request is not completing successfully. The customer app now exposes the actual HTTP/server failure instead of hiding it behind one generic message.

## Base URL

The customer API defaults are now platform-aware:

- Android emulator: `http://10.0.2.2:4100/api/v1`
- Desktop: `http://127.0.0.1:4100/api/v1`
- Physical Android: pass the reachable development-machine LAN address with `AASPASS_API_BASE_URL`.

## Development authentication

`POST /api/v1/auth/dev/login` remains development-only. The backend returns 404 when production mode or `DEV_AUTH_ENABLED=false` is active. The app does not bypass this restriction and does not create a fake local session.

## Verification

From the backend machine, verify `GET /api/v1/health` before testing the customer app. Then use the matching API base URL for the device/emulator.
