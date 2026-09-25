# Block 22 — Customer Growth Commerce

## Implemented

- Customer rewards are now exposed through the real `/growth/loyalty` database route.
- Referral codes and referral events are exposed through `/growth/referral`.
- Customers can apply a referral code through `/growth/referral/apply`.
- Customers can redeem accumulated loyalty points into the real AasPass wallet through `/growth/loyalty/redeem-to-wallet`.
- Redemption is transactional: the loyalty ledger debit and wallet credit commit together or neither commits.
- Redemption uses an idempotency key and cannot spend more points than the customer's stored balance.
- Redemption conversion is explicitly implemented as 100 points = ₹1 wallet credit.
- Customer Flutter Profile now exposes an `AasPass Rewards` surface with live points, referral code/activity, and wallet redemption.
- The Flutter API layer is connected to the backend endpoints; no local/demo rewards balance is generated.

## Production boundary

This block does not invent a referral reward before a qualifying order. Referral qualification/reward remains in the backend growth worker. Subscription payment still requires a real provider confirmation/webhook before a vendor subscription becomes ACTIVE.
