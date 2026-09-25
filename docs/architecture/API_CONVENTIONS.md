# AasPass API Conventions

- Base path: `/api/v1`
- JSON by default.
- Protected requests use `Authorization: Bearer <token>`.
- Money is integer paise with INR currency; clients never become the authority for money calculations.
- UUIDs are the default identifiers.
- Order/payment creation accepts `Idempotency-Key` and persists it server-side.
- Privileged writes emit audit records.
- Production payment webhooks must validate provider signatures before state changes.
