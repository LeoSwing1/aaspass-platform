# AasPass Money Flow

Customer checkout may contain:

- Product subtotal → vendor-side consideration
- Delivery fee → delivery settlement layer
- AasPass platform fee → AasPass revenue
- GST on applicable AasPass service/fee → tax liability layer

The backend ledger must keep these components separate.

Production marketplace settlement must be implemented through an approved payment/settlement architecture. Do not use the client to calculate or distribute vendor funds.
