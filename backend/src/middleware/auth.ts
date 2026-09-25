import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { verifyAccessToken } from '../utils/token.js';
import type { AuthUser, Role } from '../types/auth.js';
import { query } from '../db/pool.js';

declare global { namespace Express { interface Request { authUser?: AuthUser; authTokenJti?: string; } } }

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) { res.status(401).json({ error: 'AUTH_REQUIRED', message: 'Bearer token required', requestId: req.requestId }); return; }
  const payload = verifyAccessToken(header.slice(7).trim(), env.JWT_SECRET, env.JWT_ISSUER, env.JWT_AUDIENCE);
  if (!payload) { res.status(401).json({ error: 'INVALID_TOKEN', message: 'Session expired or invalid', requestId: req.requestId }); return; }
  if (env.DATABASE_URL) {
    const session = await query<{ revoked_at: string | null; expires_at: string }>('SELECT revoked_at, expires_at FROM auth_sessions WHERE jti=$1 LIMIT 1', [payload.jti]);
    const row = session.rows[0];
    if (!row || row.revoked_at || new Date(row.expires_at).getTime() <= Date.now()) {
      res.status(401).json({ error: 'SESSION_REVOKED', message: 'Session is no longer active', requestId: req.requestId });
      return;
    }
    await query('UPDATE auth_sessions SET last_seen_at=NOW() WHERE jti=$1', [payload.jti]);
  }
  req.authUser = { id: payload.id, role: payload.role, name: payload.name };
  req.authTokenJti = payload.jti;
  next();
}

export function requireRoles(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.authUser) { res.status(401).json({ error: 'AUTH_REQUIRED', requestId: req.requestId }); return; }
    if (!roles.includes(req.authUser.role)) { res.status(403).json({ error: 'FORBIDDEN', message: 'Insufficient permissions', requestId: req.requestId }); return; }
    next();
  };
}
