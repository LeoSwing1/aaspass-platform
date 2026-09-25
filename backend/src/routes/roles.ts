import { Router } from 'express';
import { ROLES } from '../types/auth.js';
import { ROLE_PERMISSIONS } from '../types/permissions.js';
const router = Router();
router.get('/', (_req, res) => {
  res.json({ roles: ROLES.map((role) => ({ role, permissions: ROLE_PERMISSIONS[role] })) });
});
export default router;
