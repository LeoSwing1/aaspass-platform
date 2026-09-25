# Architecture Decisions

## ADR-001 — One master workspace
AasPass is maintained as one repository/workspace with separate apps and one backend. This prevents diverging business logic and duplicate releases.

## ADR-002 — Backend-authoritative money
Clients can display calculations, but the backend is authoritative for price, platform fee, tax calculation, payment session creation, order totals and settlement instructions.

## ADR-003 — Shared order state machine
Customer, vendor, delivery and admin all observe one order state machine. No app creates its own status definitions.

## ADR-004 — API-level RBAC
Permissions are enforced at the API layer, then reflected in UI navigation. UI hiding is not security.

## ADR-005 — Dedicated app boundaries
Customer and delivery are Flutter apps; vendor/admin/support are web-first workspaces. All consume the same contracts and backend.
