# Block 26 — Personalized Commerce Engine

Implemented a transactional, database-derived customer feed.

## Customer feed
`GET /api/v1/customer/personalized-feed` returns:
- customer purchase stats
- recently bought products from delivered orders
- recommended products from the customer’s most purchased categories, excluding already purchased products
- currently eligible promotions, ranked against the customer’s historical order value

No recommendation record is fabricated or stored as fake inventory. The feed is derived from PostgreSQL at request time.

## Customer app
Home now includes:
- Buy again
- Picked for you
- Offers for you

All product cards still use the existing live cart controller.

## Admin analytics
Growth analytics now also exposes 30-day average order value and repeat-customer count.

## Production boundary
Offers remain subject to the authoritative checkout validation and redemption limits. The feed does not grant a discount by itself.
