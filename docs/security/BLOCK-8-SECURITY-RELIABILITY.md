# AasPass Block 8 — Security, Reliability & Production Hardening

## Implemented in v1.8
- Request correlation IDs.
- Security response headers and production HSTS.
- CORS allow-list via environment.
- Global, auth and webhook rate limits.
- 1 MB JSON request body cap.
- Production error redaction.
- JWT algorithm/type validation, issuer/audience, time checks and unique JTI.
- Database-backed session lifecycle and revocation checks.
- Liveness/readiness endpoints.
- Graceful process shutdown and database pool close.
- Operational database indexes.
- PostgreSQL backup/restore scripts.
- Security and incident runbooks.

## Required before production
- TLS at the edge/load balancer.
- Distributed Redis-backed rate limiting.
- Production secrets manager.
- Off-site automated database backups and restore drills.
- Centralized logs/alerts.
- SAST/DAST/dependency scanning.
- Penetration testing.
- Final payment/KYC/compliance approval.

## Invariants
1. Never trust pricing, fees, roles, vendor ownership or settlement amounts from a client.
2. Never log OTPs, access tokens or payment secrets.
3. Finance/admin actions require API permissions and audit logging.
4. Verify payment webhooks before state changes.
5. Use idempotency for externally retried state mutations.
6. Minimize location/PII retention.
7. Production must disable DEV_AUTH_ENABLED and use a strong JWT secret.
