# AasPass Block 8 — Operations Runbook

## Health
- `/api/v1/health/live` — process liveness.
- `/api/v1/health/ready` — database readiness.

## Backup
Run `./scripts/backup-db.ps1` with `DATABASE_URL` set. Store dumps outside the application host.

## Restore
Run `./scripts/restore-db.ps1 -DumpFile ./backups/<file>.dump` only during an approved recovery window.

## Incident priorities
- P0: payment/data corruption, cross-account exposure, widespread checkout failure.
- P1: major order/delivery outage or settlement failure.
- P2: limited degradation with workaround.
- P3: cosmetic/non-blocking.

## First response
Capture request ID → check liveness/readiness → inspect payment/webhook events → freeze risky financial actions if reconciliation is uncertain → preserve audit records → recover only after data integrity is understood.
