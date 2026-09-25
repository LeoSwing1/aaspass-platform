# Customer 360 — AasPass

Every customer receives a unique customer code when their database identity is created:
`AAS-CUS-######`

The code is durable and is independent from the registered mobile number. The mobile number is the support lookup key; the customer code is the human-facing account identifier.

## Support lookup
`GET /api/v1/support/customers/lookup?phone=...`

Protected by `VIEW_CUSTOMER_PROFILE` and role scope.

## Returned domains
- Identity
- Contact
- Account status
- Addresses
- Orders / payments
- Active delivery state
- Support history
- Cart summary
- Device registration summary

## Security rules
- Lookup requires authenticated support/admin role with `VIEW_CUSTOMER_PROFILE`.
- Lookup is audited with customer ID + last four digits of the searched phone.
- Do not log full phone numbers in audit metadata.
- Vendor/delivery/customer roles cannot use support lookup.
