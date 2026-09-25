# AasPass Block 24 — Customer Account Commerce

This block turns the BigBasket-style account menu into connected AasPass functionality instead of placeholder actions.

## Implemented

### Wishlist
- PostgreSQL-backed `customer_wishlists`.
- Add/remove/list endpoints under `/api/v1/account/wishlist`.
- Customer app can add a wishlisted product to the live cart.

### Shopping lists
- Persistent lists and list items in PostgreSQL.
- Create/rename/delete/list endpoints.
- Product quantities are stored server-side.

### Ratings & reviews
- Customers can review only products from their own `DELIVERED` orders.
- One review per customer/order/product, with update-on-resubmit behavior.
- Vendor aggregate rating and review count are recalculated from the real review ledger.

### Saved payments
- Customer can read provider-issued saved payment references.
- Raw card numbers/CVV are never accepted by this API.
- Provider tokenization remains the only intended write path.

### Gift cards
- Gift-card balances and transactions are stored in PostgreSQL.
- Admins with `MANAGE_GIFT_CARDS` can issue a card and receive the one-time raw code.
- Customer redemption hashes the submitted code and credits the real AasPass Wallet transactionally.
- Idempotency prevents double redemption.

### Privacy & security
- Customer can view active authenticated sessions without exposing JWTs/JTIs.
- Customer can revoke all other active sessions while retaining the current session.
- Existing auth-session revocation remains server-enforced by the authentication middleware.

## Production boundaries

- Saved payment methods are intentionally provider-reference-only; AasPass does not store PAN/CVV.
- Gift-card issuance is admin-controlled. The raw code is returned only at issuance and is never stored in plaintext.
- No feature uses a local fake balance, fake review, or fake gift-card success state.

## Validation

- Backend TypeScript syntax: 40 files, 0 syntax errors.
- Relative import audit: 40 files, 0 missing imports.
- Structure audit: PASS.
- Flutter SDK was not installed in the build environment, so an APK/runtime build was not claimed.
