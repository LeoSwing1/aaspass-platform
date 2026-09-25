# AasPass Block 2 — Customer Application

## Product direction
The customer experience follows strong online-grocery patterns: prominent location, search, shop-by-category navigation, promotional content, nearby stores, dense product cards, quick add controls, basket/checkout, order tracking and account areas. The reference pattern is intentionally adapted to AasPass's neighborhood-vendor model rather than copied.

## Implemented in v0.2
- Branded splash/onboarding and development OTP login (270303)
- Location permission flow using geolocator
- Location-aware delivery label and serviceability-ready structure
- BigBasket-inspired commerce home layout
- Category rail and full category grid
- Nearby vendors with rating, distance, ETA and share action
- Product catalogue with 18+ local-commerce examples
- Quick add / quantity steppers
- Persistent local cart with SharedPreferences
- Checkout with separate ₹1 AasPass fee and illustrative GST calculation
- UPI/Card/COD selection surface
- Local order persistence and order timeline
- Profile, invite/share and support entry points

## Not yet production-connected
- Firebase OTP exchange
- Server-authoritative catalogue/serviceability
- Cashfree session creation and webhook-backed payment status
- Real vendor/delivery GPS tracking
- FCM device registration and push delivery

Those belong to the next integration block and must be wired to the shared AasPass backend from Block 1.
