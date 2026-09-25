# Block 32 — Backend Environment Bootstrap

The backend loads `backend/.env` with Node 22 native `loadEnvFile()` before Zod validates the environment. `DATABASE_URL` remains required and must point to the actual AasPass PostgreSQL database.
