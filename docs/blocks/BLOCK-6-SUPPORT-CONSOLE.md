# Block 6 — Support Console

## Executed
- Dedicated support web console under `apps/support`.
- Shared AasPass support API under `/api/v1/support`.
- Support queue with status/priority/search filters.
- Order-linked ticket context.
- Conversation + event timeline.
- Customer/vendor/delivery issue routing.
- Internal notes that are not customer-visible.
- Server-side RBAC and ticket access enforcement.
- Status transitions and audit entries.
- Support messages and events stored in PostgreSQL.

## Role boundaries
- Support Lead can manage support and reassign tickets.
- Support Agent can work scoped tickets but cannot reassign tickets or access financial approval.
- Customer/Vendor/Delivery roles can only access their own/assigned scope.
- Super Admin/Admin retain platform-wide support visibility.

## Acceptance target
A support operator can open a ticket, inspect linked order data, communicate, add internal notes, change status, resolve the issue, and leave an auditable trail without leaving the support console.
