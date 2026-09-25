# AasPass System Architecture

```text
                               ┌─────────────────────────────┐
                               │        AasPass HQ            │
                               │ Admin / Super Admin / Finance│
                               └──────────────┬──────────────┘
                                              │
┌─────────────────────┐  ┌───────────────────┼───────────────────┐  ┌─────────────────────┐
│ Customer Flutter App│  │ Vendor Workspace   │ Support Console   │  │ Delivery Partner App│
└──────────┬──────────┘  └──────────┬────────┘─────────┬─────────┘  └──────────┬──────────┘
           │                         │                  │                       │
           └─────────────────────────┴──────────┬───────┴───────────────────────┘
                                                │
                                      ┌─────────▼─────────┐
                                      │   AasPass API     │
                                      │ Auth / RBAC / OMS │
                                      │ Catalog / Search  │
                                      │ Payments / Ledger │
                                      │ Delivery / Support│
                                      └───────┬──────┬────┘
                                              │      │
                              ┌───────────────┘      └────────────────┐
                              │                                      │
                    ┌─────────▼─────────┐                  ┌─────────▼─────────┐
                    │ PostgreSQL         │                  │ Event/Queue Layer │
                    │ source of truth   │                  │ Redis + workers   │
                    └───────────────────┘                  └─────────┬─────────┘
                                                                     │
                    ┌───────────────────────┬────────────────────────┼────────────────────┐
                    │                       │                        │                    │
              Payments/Settlement       Maps/GPS               Notifications         KYC/Storage
```

## Hard boundaries

1. Client applications never become the authority for money, permissions or order state.
2. Backend is authoritative for order transitions, price calculations, ledger entries and settlement instructions.
3. Payment provider secrets never ship in mobile/web clients.
4. Every privileged action is RBAC-checked at API level and audit logged.
5. Vendor/product/customer/delivery data is shared across apps through the core API.
