# Block 32 — Cashfree Webhook Parser

## Problem
The backend reached the integrations route after the previous startup syntax error was fixed, but startup then failed because `routes/integrations/index.ts` imported `parseCashfreePaymentEvent` from `services/payment/cashfree.ts` while that export did not exist.

## Implementation
Added the missing parser and typed result. The parser reads the Cashfree webhook order/payment fields from the provider's nested `data` payload and accepts compatible top-level fields. It normalizes provider statuses to `PAID`, `FAILED`, or `PENDING`, converts rupee amounts to paise, and captures the provider payment ID.

No payment is marked successful by the parser itself. The existing webhook route remains responsible for amount validation, database updates, inventory/wallet rollback on failure, revenue posting, and order events.

## Validation
The changed TypeScript files were syntax-transpiled with the repository's TypeScript compiler. The final Windows `npm run dev` startup check remains the authoritative runtime validation because the development container does not reproduce the user's local PostgreSQL/environment.
