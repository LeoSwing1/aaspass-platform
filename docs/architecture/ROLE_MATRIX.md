# AasPass Role Matrix

| Role | Scope | Finance approval | Platform config | Orders | Vendors | Delivery | Support |
|---|---|---|---|---|---|---|---|
| Super Admin | Global | Full | Full | Full | Full | Full | Full |
| Finance Admin | Finance | Full | Pricing/fee scope | View | View | View | View |
| Operations Admin | Operations | View | Zones/serviceability | Full | Full | Full | Full |
| Vendor Manager | Assigned vendors | None | None | Vendor scope | Full assigned | None | Vendor scope |
| Delivery Manager | Delivery scope | Payout view | Delivery config | Delivery scope | None | Full | Delivery scope |
| Support Lead | Support scope | Request refund | None | View/request | View | View | Full |
| Support Agent | Ticket scope | Request only | None | View | View | View | Own tickets |
| Vendor Owner | Own vendor | Own settlement view | Own store | Own orders | Own store | None | Own tickets |
| Vendor Staff | Own vendor | None | Limited | Limited | Limited | None | None |
| Delivery Partner | Own assignments | Own wallet view | None | Assigned only | None | Own | Own tickets |
| Customer | Own account | Own payments/refund status | None | Own | None | None | Own tickets |
