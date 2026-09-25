# AasPass Customer App — Master Feature Map

## Identity & access
- Splash / brand
- Onboarding
- Mobile login / OTP
- Customer identity: `AAS-CUS-######`
- Session/token storage
- Account/profile

## Discovery (BigBasket-inspired interaction patterns, AasPass-owned UI)
- Current location
- Serviceability
- Search
- Category rails/grid
- Nearby vendors
- Rating, review count, distance, ETA
- Vendor sharing
- Product grid
- Offers/promotional discovery

## Commerce
- Vendor/store page
- Product details
- Add / quantity controls
- Single-vendor cart protection
- Persistent cart
- Address selection
- Checkout
- Product subtotal
- Delivery fee
- ₹1 AasPass platform fee
- Applicable GST on the platform fee
- UPI / Card / COD

## Orders & delivery
- Order confirmation
- Active orders
- Order history
- Order detail
- Order-state timeline
- Delivery assignment status
- Out-for-delivery tracking
- Delivered state

## Customer account
- Customer ID
- Registered mobile
- Saved addresses
- Notifications
- Invite/share
- Help & support
- Privacy & security
- About AasPass

## Support
- Self-service help
- WhatsApp contact
- In-app support ticket creation
- Ticket linked to account
- Agent lookup by registered mobile
- Customer 360 profile for support

## Data/integration map
```text
Customer App
  ├── Auth → /auth/dev/login (development only)
  ├── Profile → /customer/profile
  ├── Location → /customer/serviceability + /customer/vendors
  ├── Discovery → /customer/categories + /customer/vendors
  ├── Catalog → /customer/vendors/:id/products
  ├── Cart → /customer/cart
  ├── Checkout → /customer/orders
  ├── Orders → /customer/orders + /customer/orders/:id
  └── Support → /support

Support Web
  └── Registered mobile → /support/customers/lookup → Customer 360

AasPass Core
  ├── PostgreSQL
  ├── RBAC
  ├── Audit logs
  ├── Payments/settlement
  ├── Delivery
  └── Notifications
```

## Customer 360 support view
The registered mobile number is the primary lookup input. The profile returns:
- Customer ID
- Name / phone / email
- Account status / created date
- Order count / active orders / total order value
- Saved addresses
- Recent orders with payment state
- Active delivery/order state
- Support tickets
- Cart summary
- Active device-token count/platforms

Sensitive information is protected behind the `VIEW_CUSTOMER_PROFILE` permission and support audit logging.
