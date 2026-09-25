# Block 23 — Customer Profile / My Account UX

The customer profile screen is now rebuilt around the supplied BigBasket-style reference while remaining AasPass-branded and database-backed.

## Implemented
- My Account app bar and back navigation.
- Live customer name, phone, email and persistent AasPass Customer ID.
- Editable profile fields through the existing authenticated `PATCH /customer/profile` route.
- Patterned account card and compact edit action.
- Quick actions for Orders, AasPass Wallet and Addresses.
- Live wallet balance and recent wallet transactions.
- AasPass Rewards entry into the existing loyalty/referral system.
- Notifications and notification-preference controls backed by PostgreSQL.
- Location permission/settings entry.
- Support/FAQ entry.
- Real logout: access token and cached customer ID are cleared and the app returns to authentication.
- Account footer and policy links are visually represented without pretending unsupported legal content exists.

## Intentional boundaries
Wishlist, shopping lists, saved payment methods, ratings/reviews and gift cards are shown as account destinations but are not backed by fabricated data. They currently explain the feature state instead of pretending those records exist.

## Source of truth
Profile, wallet, notification preferences and authentication state remain server/account-backed. No demo customer data was added.
