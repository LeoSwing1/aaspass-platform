export const ROLES = [
  'SUPER_ADMIN', 'ADMIN', 'OPERATIONS_ADMIN', 'FINANCE_ADMIN', 'VENDOR_MANAGER',
  'DELIVERY_MANAGER', 'SUPPORT_LEAD', 'SUPPORT_AGENT', 'VENDOR_OWNER', 'VENDOR_STAFF',
  'DELIVERY_PARTNER', 'CUSTOMER'
] as const;
export type Role = (typeof ROLES)[number];
export interface AuthUser { id: string; role: Role; name: string; }
export interface AccessTokenPayload extends AuthUser { iat: number; exp: number; jti: string; iss: string; aud: string; }
