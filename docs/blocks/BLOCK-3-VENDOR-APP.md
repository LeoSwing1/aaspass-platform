# Block 3 — Vendor Application

## Status
Major vendor vertical v0.2 implemented in the single AasPass master workspace.

## Scope implemented
- Vendor development login using the shared development OTP gate (270303 only when development auth is enabled)
- Store overview and open/closed state
- Order queue with vendor-side state progression
- Product catalog/search/toggle visibility
- Add product workflow
- Inventory and reorder queue
- Store profile/service radius/preparation time
- Vendor subscription plans: ₹199 / ₹499 / ₹999
- Analytics view
- Finance & settlements view
- Staff access view
- KYC/verification view
- Support center
- Shared AasPass branding
- Backend routes for vendor profile, dashboard, products, orders, order status and subscription

## Acceptance criteria
1. Vendor can sign in in development mode.
2. Vendor can view store health and current orders.
3. Vendor can accept a new order, mark it preparing and ready for pickup.
4. Vendor can create/update products and manage inventory state.
5. Vendor can view subscription, finance, staff, KYC and support surfaces.
6. Backend enforces vendor-role authentication.
7. Database mode resolves the vendor from the authenticated owner/member rather than trusting a vendor id from the client.
8. Production must replace the development auth path and connect real settlement/payment providers.

## Next work inside Block 3
- Real KYC document upload and review integration
- Real category/vendor/product APIs in the frontend
- Vendor staff invitation endpoints
- Production subscription billing provider
- Image upload/object storage
- Settlement statements/reconciliation API
- Push/WhatsApp vendor order alerts
- Concurrency-safe inventory reservation
