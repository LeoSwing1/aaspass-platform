# RBAC foundation

Authorization is enforced at the API layer, not only in UI navigation.

Roles:
- SUPER_ADMIN
- ADMIN
- OPERATIONS_ADMIN
- FINANCE_ADMIN
- VENDOR_MANAGER
- DELIVERY_MANAGER
- SUPPORT_LEAD
- SUPPORT_AGENT
- VENDOR_OWNER
- VENDOR_STAFF
- DELIVERY_PARTNER
- CUSTOMER

Use `requirePermission()` for feature authorization. Use `requireAuth()` for identity checks and `requireRoles()` only where an endpoint truly needs an exact role set.

Financial approval/settlement privileges are reserved for finance/admin paths. Front-line support, vendors and delivery partners do not receive platform-wide configuration or financial-approval permissions.
