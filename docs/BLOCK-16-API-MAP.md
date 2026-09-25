# Block 16 API map

## Admin HQ

- `GET /api/v1/admin/summary`
- `GET /api/v1/admin/orders`
- `GET /api/v1/admin/orders/:id`
- `PATCH /api/v1/admin/orders/:id/status`
- `GET /api/v1/admin/vendors`
- `PATCH /api/v1/admin/vendors/:id/status`
- `PATCH /api/v1/admin/vendors/:id/kyc`
- `GET /api/v1/admin/customers`
- `GET /api/v1/admin/customers/:customerId`
- `PATCH /api/v1/admin/customers/:customerId/status`
- `GET /api/v1/admin/delivery`
- `PATCH /api/v1/admin/delivery/:id/status`
- `GET /api/v1/admin/support`
- `GET /api/v1/admin/finance`
- `GET /api/v1/admin/people`
- `GET /api/v1/admin/settings`
- `GET /api/v1/admin/operations/overview`

All routes are authenticated and permission-gated.

## Support

- `GET /api/v1/support/customers/lookup?phone=...`
- `GET /api/v1/support/customers/:customerId`
- `GET /api/v1/support`
- `GET /api/v1/support/:id`
- `POST /api/v1/support/:id/messages`
- `POST /api/v1/support/:id/internal-note`
- `PATCH /api/v1/support/:id`

## Shared identity

Customer IDs are generated in PostgreSQL as `AAS-CUS-######` and are used by Customer, Admin and Support surfaces.
