import { hasPermission } from '../types/permissions.js';
export function requirePermission(permission) {
    return (req, res, next) => {
        const user = req.authUser;
        if (!user) {
            res.status(401).json({ error: 'AUTH_REQUIRED' });
            return;
        }
        if (!hasPermission(user.role, permission)) {
            res.status(403).json({ error: 'FORBIDDEN', message: `Missing permission: ${permission}` });
            return;
        }
        next();
    };
}
