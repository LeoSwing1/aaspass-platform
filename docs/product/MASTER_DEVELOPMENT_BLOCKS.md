# AasPass Master Development Blocks

AasPass is one shared platform with multiple application surfaces. Each block is developed against the same contracts, database and backend so features connect instead of becoming separate prototypes.

| Block | Scope | Status |
|---|---|---|
| 0 | Product + architecture freeze | DONE |
| 1 | Core platform: PostgreSQL, auth, RBAC, identity, audit, money conventions, base API | EXECUTED |
| 2 | Customer vertical | EXECUTED |
| 3 | Vendor vertical | EXECUTED |
| 4 | Delivery partner vertical | EXECUTED |
| 5 | AasPass HQ/Admin | EXECUTED |
| 6 | Support web console | EXECUTED |
| 7 | Production integrations foundation | EXECUTED |
| 8 | Reliability + security | EXECUTED |
| 9 | Pilot → 10,000-vendor scale controls | EXECUTED |
| 10 | Integration orchestration | EXECUTED |
| 11 | End-to-end transaction integrity + fulfillment | **EXECUTED** |
| 12 | Growth + monetization platform | NEXT |
| 13 | Cross-app UI/UX refresh | EXECUTED |
| 14 | Reference-driven customer commerce + native permissions + vendor/delivery continuity | EXECUTED IN SOURCE; DEVICE BUILD PENDING |

## Block 11 focus
The shared transaction path is now designed as:

Customer checkout → payment/COD confirmation → vendor queue → vendor acceptance → preparation → ready for pickup → delivery dispatch → partner acceptance → pickup OTP → out-for-delivery → drop OTP → delivered → customer notification → support visibility → finance reconciliation.

## Rule
Execute blocks sequentially where dependencies require it, but keep the shared contracts and backend architecture stable so every application plugs into the same platform.


## Block 13 UI/UX refresh
- Customer: grocery-commerce visual system, safe responsive cards, polished navigation.
- Vendor: Flutter mobile merchant app; legacy web moved to `legacy/vendor-web`.
- Delivery Partner: refreshed Flutter mobile operating UI.
- Support/Admin: web-only visual refinements.
- Business logic/API contracts unchanged by this UI block.


## Block 14 focus
- Customer home follows the supplied grocery-commerce hierarchy without importing third-party proprietary artwork.
- First authenticated customer home entry explains and requests location permission; location remains recoverable from the header.
- Customer primary navigation is Home / Categories / Top picks, while Cart and Orders stay accessible from the home header and Account remains accessible from the profile action.
- Vendor and Delivery Partner retain their own operational workflows but share the same AasPass visual language and explicit location-permission recovery patterns.
- Native platform folders are generated locally with `flutter create .`; required Android/iOS location declarations are documented separately.
