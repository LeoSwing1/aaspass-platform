# Block 32 — Local Environment & Boolean Parsing Hardening

## Root cause
The backend used Zod `z.coerce.boolean()` for environment variables. JavaScript boolean coercion treats any non-empty string, including `"false"`, as `true`. Therefore `DATABASE_SSL=false` was parsed as `true`, causing PostgreSQL clients to attempt SSL against a local PostgreSQL server that does not support SSL.

## Fix
Environment booleans now parse the literal strings `true` and `false` explicitly before Zod validation. This applies to `DATABASE_SSL`, `TRUST_PROXY`, `DEV_AUTH_ENABLED`, and `NOTIFICATION_DISPATCH_ENABLED`.

The existing local `.env` can remain:

```env
DATABASE_SSL=false
```

No deployment is required for this local development setup.
